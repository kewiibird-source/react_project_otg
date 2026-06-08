const express = require('express');
const oracledb = require('oracledb');
const fs = require('fs');
const db = require("../db");
const jwtAuthentication = require('../auth'); 
const multer = require('multer');
const { sendNotification } = require('../utils/notiHelper');

oracledb.fetchAsString = [oracledb.CLOB];
const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');        
        cb(null, Date.now() + '-' + decodedName);
    }
});
const upload = multer({ storage }); 

// 1. 게시글 작성 (+ 게시글 내용에서 유저 언급 알림)
router.post('/', jwtAuthentication, upload.array('images', 5), async (req, res) => {
    const { title, content, category = 'ETC', parentPostId } = req.body;
    let hashtags = [];
    if (req.body.hashtags) {
        try { hashtags = JSON.parse(req.body.hashtags); } 
        catch (e) { hashtags = [req.body.hashtags]; } 
    }
    const userId = req.user?.id || req.userId; 
    const files = req.files || []; 
    let connection;

    try {
        connection = await db.getConnection();
        const txOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false };

        let thumbnailUrl = null;
        const host = `${req.protocol}://${req.get('host')}/`;
        if (files.length > 0) thumbnailUrl = host + files[0].destination + files[0].filename;

        const insertPostSql = `
            INSERT INTO POSTS (USER_ID, TITLE, CONTENT, CATEGORY, THUMBNAIL_URL, CREATED_AT, PARENT_POST_ID, STATUS)
            VALUES (:userId, :title, :content, :category, :thumbnailUrl, CURRENT_TIMESTAMP, :parentPostId, 'PUBLISHED')
            RETURNING ID INTO :insertId
        `;
        const postResult = await connection.execute(insertPostSql, { userId, title, content, category, thumbnailUrl, parentPostId: parentPostId || null, insertId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } }, txOptions);
        const newPostId = postResult.outBinds.insertId[0];

        if (files.length > 0) {
            const insertImageSql = `INSERT INTO POST_IMAGES (POST_ID, IMAGE_URL, SORT_ORDER, CREATED_AT) VALUES (:postId, :imageUrl, :sortOrder, CURRENT_TIMESTAMP)`;
            const imagePromises = files.map((file, index) => connection.execute(insertImageSql, { postId: newPostId, imageUrl: host + file.destination + file.filename, sortOrder: index + 1 }, txOptions));
            await Promise.all(imagePromises);
        }

        if (hashtags && hashtags.length > 0) {
            for (let tagName of hashtags) {
                const cleanTagName = tagName.replace(/^#/, '').trim();
                if (!cleanTagName) continue; 
                let currentHashtagId;
                const checkResult = await connection.execute(`SELECT ID FROM HASHTAGS WHERE NAME = :name`, { name: cleanTagName }, txOptions);
                if (checkResult.rows.length > 0) currentHashtagId = checkResult.rows[0].ID;
                else {
                    const insertMasterResult = await connection.execute(`INSERT INTO HASHTAGS (NAME, CREATED_AT) VALUES (:name, CURRENT_TIMESTAMP) RETURNING ID INTO :newId`, { name: cleanTagName, newId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } }, txOptions);
                    currentHashtagId = insertMasterResult.outBinds.newId[0];
                }
                await connection.execute(`INSERT INTO POST_HASHTAGS (POST_ID, HASHTAG_ID, CREATED_AT) VALUES (:postId, :hashtagId, CURRENT_TIMESTAMP)`, { postId: newPostId, hashtagId: currentHashtagId }, txOptions);
            }
        }
        await connection.commit();
        res.json({ result: true, message: "게시글 등록 성공", postId: newPostId });

        // ✨ 3. 댓글 내 언급(Mention) 처리
        const mentionRegex = /@([a-zA-Z0-9가-힣_]+)/g;
        const mentions = [...content.matchAll(mentionRegex)].map(match => match[1]);
        if (mentions.length > 0) {
            for (const nickname of mentions) {
                const userCheck = await connection.execute(
                    `SELECT ID FROM USERS WHERE NICKNAME = :nickname`, 
                    { nickname }, 
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                if (userCheck.rows.length > 0) {
                    const mentionedUserId = userCheck.rows[0].ID;

                    // ✨ 본인 제외 + 이미 REPLY 알림 받은 사람 제외
                    const alreadyNotified = parentCommentId && mentionedUserId === parentCommentAuthorId;

                    if (mentionedUserId !== userId && !alreadyNotified) {
                        await sendNotification(mentionedUserId, userId, 'MENTION', postId, '댓글에서 당신을 언급했습니다.');
                    }
                }
            }
        }
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (e) {} }
        if (files.length > 0) files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        console.error('\n🚨 [POST /] 글 작성 에러:\n', error); res.status(500).json({ result: false });
    } finally { if (connection) await connection.close(); }
});

// 2. 내 게시글 조회
router.get('/my', jwtAuthentication, async (req, res) => {
    // ... (기존 코드와 완전히 동일하므로 생략하지 않고 모두 포함시켰습니다)
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId; 

        const statSql = `
            SELECT 
                (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWING_ID = :userId) AS FOLLOWER_COUNT,
                (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = :userId) AS FOLLOWING_COUNT,
                U.BIO, U.PROFILE_IMAGE
            FROM USERS U WHERE U.ID = :userId
        `;
        const statResult = await connection.execute(statSql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const stats = statResult.rows[0];

        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", 
                CASE 
                    WHEN P.UPDATED_AT IS NOT NULL 
                    THEN TO_CHAR(P.UPDATED_AT, 'YYYY-MM-DD HH24:MI') || ' (수정됨)' 
                    ELSE TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') 
                END AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                P.VIEW_COUNT AS "viewCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID AND RP.STATUS = 'PUBLISHED'), 0) AS "quoteCount"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE P.USER_ID = :userId AND P.STATUS = 'PUBLISHED'
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const myPosts = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            thumbnail: row.imageUrls ? row.imageUrls.split('|')[0] : '', images: row.imageUrls ? row.imageUrls.split('|') : [],       
            category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount, viewCount: row.viewCount || 0,
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));
        
        res.json({ result: true, posts: myPosts, postCount: myPosts.length, followerCount: stats.FOLLOWER_COUNT, followingCount: stats.FOLLOWING_COUNT, bio: stats.BIO, profileImage: stats.PROFILE_IMAGE });
    } catch (error) { console.error('\n🚨 [GET /my] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 3. 전체 피드 조회 API
router.get('/', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;

        const sql = `
            SELECT 
                P.ID AS "id", P.USER_ID AS "authorId", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", 
                P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", 
                CASE 
                    WHEN P.UPDATED_AT IS NOT NULL THEN TO_CHAR(P.UPDATED_AT, 'YYYY-MM-DD HH24:MI') || ' (수정됨)' 
                    ELSE TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') 
                END AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                P.VIEW_COUNT AS "viewCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID AND RP.STATUS = 'PUBLISHED'), 0) AS "quoteCount",
                (SELECT COUNT(*) FROM SCRAPS WHERE POST_ID = P.ID AND USER_ID = :userId) AS "isScrapped",
                NVL((SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = :userId AND FOLLOWING_ID = P.USER_ID), 0) AS "isFollowing"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE P.STATUS = 'PUBLISHED'
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const cleanPosts = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            images: row.imageUrls ? row.imageUrls.split('|') : [], category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount, isScrapped: row.isScrapped > 0, isFollowing: row.isFollowing > 0,
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));
        res.json({ result: true, posts: cleanPosts });
    } catch (error) { console.error('\n🚨 [GET /] 홈 피드 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 4. 좋아요 토글 (+ 좋아요 알림)
router.post('/:id/like', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const postId = req.params.id;

        // ✨ 1. 대상 게시글의 작성자 먼저 조회하기
        const postCheck = await connection.execute(`SELECT USER_ID FROM POSTS WHERE ID = :postId`, { postId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const targetPostAuthorId = postCheck.rows.length > 0 ? postCheck.rows[0].USER_ID : null;

        const checkResult = await connection.execute(`SELECT ID FROM LIKES WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId });
        if (checkResult.rows.length > 0) {
            await connection.execute(`DELETE FROM LIKES WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'unliked' });
        } else {
            await connection.execute(`INSERT INTO LIKES (USER_ID, POST_ID) VALUES (:userId, :postId)`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'liked' });
            
            // ✨ 2. 알림 추가: 게시글 작성자가 존재하고, 내가 내 글에 누른게 아닐 때
            if (targetPostAuthorId && userId !== targetPostAuthorId) { 
                await sendNotification(targetPostAuthorId, userId, 'LIKE', postId, '누군가 당신의 게시물을 좋아합니다.');
            }
        }
    } catch (error) { console.error('\n🚨 [POST /like] 에러:\n', error); res.status(500).json({ result: false }); } 
    finally { if (connection) await connection.close(); }
});

// 5. 댓글 작성 (+ 댓글, 답글, 언급 알림)
router.post('/:id/comment', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const postId = req.params.id;
        const { content, parentCommentId } = req.body; 
        
        await connection.execute(
            `INSERT INTO COMMENTS (POST_ID, USER_ID, CONTENT, PARENT_COMMENT_ID) VALUES (:postId, :userId, :content, :parentCommentId)`, 
            { postId, userId, content, parentCommentId: parentCommentId || null }, { autoCommit: true }
        );
        res.json({ result: true });

        // ✨ 1. 게시글 작성자 조회
        const postCheck = await connection.execute(`SELECT USER_ID FROM POSTS WHERE ID = :postId`, { postId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const postAuthorId = postCheck.rows.length > 0 ? postCheck.rows[0].USER_ID : null;

        // ✨ 2. 알림 분기 처리 (답글 vs 댓글)
        let parentCommentAuthorId = null;

        if (parentCommentId) {
            const commentCheck = await connection.execute(
                `SELECT USER_ID FROM COMMENTS WHERE ID = :parentCommentId`, 
                { parentCommentId }, 
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            parentCommentAuthorId = commentCheck.rows.length > 0 ? commentCheck.rows[0].USER_ID : null;
            
            if (parentCommentAuthorId && parentCommentAuthorId !== userId) {
                await sendNotification(parentCommentAuthorId, userId, 'REPLY', postId, '당신의 댓글에 답글이 달렸습니다.');
            }
        } else {
            if (postAuthorId && postAuthorId !== userId) {
                await sendNotification(postAuthorId, userId, 'COMMENT', postId, '게시물에 댓글이 달렸습니다.');
            }
        }

        // ✨ 3. [알림 추가] 댓글 내 언급(Mention) 처리
        const mentionRegex = /@([a-zA-Z0-9가-힣_]+)/g;
        const mentions = [...content.matchAll(mentionRegex)].map(match => match[1]);
        if (mentions.length > 0) {
            for (const nickname of mentions) {
                const userCheck = await connection.execute(`SELECT ID FROM USERS WHERE NICKNAME = :nickname`, { nickname }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                if (userCheck.rows.length > 0) {
                    const mentionedUserId = userCheck.rows[0].ID;
                    if (mentionedUserId !== userId) {
                        await sendNotification(mentionedUserId, userId, 'MENTION', postId, '댓글에서 당신을 언급했습니다.');
                    }
                }
            }
        }

    } catch (error) { console.error('\n🚨 [POST /comment] 에러:\n', error); res.status(500).json({ result: false }); } 
    finally { if (connection) await connection.close(); }
});

// 6. 댓글 수정 API
router.put('/comments/:commentId', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const { content } = req.body;
        
        const result = await connection.execute(
            `UPDATE COMMENTS SET CONTENT = :content, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = :commentId AND USER_ID = :userId`, 
            { content, commentId: req.params.commentId, userId }, { autoCommit: true }
        );
        if (result.rowsAffected > 0) res.json({ result: true });
        else res.json({ result: false, message: '권한이 없습니다.' });
    } catch (error) { console.error('\n🚨 [PUT /comments] 에러:\n', error); res.status(500).json({ result: false }); } 
    finally { if (connection) await connection.close(); }
});

// 6.5 댓글 삭제
router.delete('/comments/:commentId', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const commentId = req.params.commentId;
        
        const sql = `UPDATE COMMENTS SET STATUS = 'DELETED', UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = :commentId AND USER_ID = :userId`;
        const result = await connection.execute(sql, { commentId, userId }, { autoCommit: true });

        if (result.rowsAffected > 0) {
            res.json({ result: true, message: '댓글이 성공적으로 삭제되었습니다.' });
        } else {
            res.status(403).json({ result: false, message: '삭제 권한이 없거나 존재하지 않는 댓글입니다.' });
        }
    } catch (error) { console.error('\n🚨 [DELETE /comments/:commentId] 에러:\n', error); res.status(500).json({ result: false, message: '서버 오류가 발생했습니다.' }); 
    } finally { if (connection) await connection.close(); }
});

// 7. 댓글 조회 API
router.get('/:id/comments', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const sql = `
            SELECT C.ID AS "id", C.CONTENT AS "content", 
                   CASE 
                     WHEN C.UPDATED_AT IS NOT NULL 
                     THEN TO_CHAR(C.UPDATED_AT, 'MM-DD HH24:MI') || ' (수정됨)' 
                     ELSE TO_CHAR(C.CREATED_AT, 'MM-DD HH24:MI') 
                   END AS "createdAt", 
                   U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", C.PARENT_COMMENT_ID AS "parentCommentId"
            FROM COMMENTS C JOIN USERS U ON C.USER_ID = U.ID
            WHERE C.POST_ID = :postId AND C.STATUS = 'PUBLISHED'
            ORDER BY NVL(C.PARENT_COMMENT_ID, C.ID) ASC, C.ID ASC
        `;
        const result = await connection.execute(sql, { postId: req.params.id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ result: true, comments: result.rows });
    } catch (error) { console.error('\n🚨 [GET /comments] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 8. 특정 유저 프로필 피드 조회
router.get('/user/:nickname', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const currentUserId = req.user?.id || req.userId; 
        const targetNickname = req.params.nickname; 

        const userStatSql = `
            SELECT U.ID, U.BIO, U.PROFILE_IMAGE,
                (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWING_ID = U.ID) AS FOLLOWER_COUNT,
                (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = U.ID) AS FOLLOWING_COUNT,
                (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = :currentUserId AND FOLLOWING_ID = U.ID) AS IS_FOLLOWING
            FROM USERS U WHERE U.NICKNAME = :nickname
        `;
        const userCheck = await connection.execute(userStatSql, { currentUserId, nickname: targetNickname }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (userCheck.rows.length === 0) return res.status(404).json({ result: false, message: '존재하지 않는 유저입니다.' });
        const targetUserId = userCheck.rows[0].ID;
        const stats = userCheck.rows[0];

        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", 
                CASE 
                    WHEN P.UPDATED_AT IS NOT NULL 
                    THEN TO_CHAR(P.UPDATED_AT, 'YYYY-MM-DD HH24:MI') || ' (수정됨)' 
                    ELSE TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') 
                END AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :currentUserId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID AND RP.STATUS = 'PUBLISHED'), 0) AS "quoteCount"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE P.USER_ID = :targetUserId AND P.STATUS = 'PUBLISHED'
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { currentUserId, targetUserId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const userPosts = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            thumbnail: row.imageUrls ? row.imageUrls.split('|')[0] : '', images: row.imageUrls ? row.imageUrls.split('|') : [],       
            category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount,
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));

        res.json({ result: true, nickname: targetNickname, posts: userPosts, postCount: userPosts.length, followerCount: stats.FOLLOWER_COUNT, followingCount: stats.FOLLOWING_COUNT, isFollowing: stats.IS_FOLLOWING > 0, bio: stats.BIO, profileImage: stats.PROFILE_IMAGE });
    } catch (error) { console.error('\n🚨 [GET /user/:nickname] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 유저 팔로워/팔로잉 조회 
router.get('/user/:nickname/:type', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        const { nickname, type } = req.params;
        if (type !== 'followers' && type !== 'following') return res.status(400).json({ result: false, message: '잘못된 접근입니다.' });

        connection = await db.getConnection();
        const myId = req.user?.id || req.userId;

        const userCheck = await connection.execute(`SELECT ID FROM USERS WHERE NICKNAME = :nickname`, { nickname });
        if (userCheck.rows.length === 0) return res.status(404).json({ result: false, message: '유저를 찾을 수 없습니다.' });
        const targetId = userCheck.rows[0].ID;

        const sql = type === 'followers' 
            ? `SELECT U.ID, U.NICKNAME, U.PROFILE_IMAGE, 
                      (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = :myId AND FOLLOWING_ID = U.ID) AS IS_FOLLOWING
               FROM FOLLOWS F JOIN USERS U ON F.FOLLOWER_ID = U.ID WHERE F.FOLLOWING_ID = :targetId`
            : `SELECT U.ID, U.NICKNAME, U.PROFILE_IMAGE, 
                      1 AS IS_FOLLOWING
               FROM FOLLOWS F JOIN USERS U ON F.FOLLOWING_ID = U.ID WHERE F.FOLLOWER_ID = :targetId`;
            
        const result = await connection.execute(sql, { myId, targetId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ result: true, list: result.rows });
    } catch (error) { console.error('\n🚨 [GET /user/:nickname/:type] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 1. 스크랩(보관함) 토글 API
router.post('/:id/scrap', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const postId = req.params.id;

        const checkResult = await connection.execute(`SELECT ID FROM SCRAPS WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId });

        if (checkResult.rows.length > 0) {
            await connection.execute(`DELETE FROM SCRAPS WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'unscrapped', isScrapped: false });
        } else {
            await connection.execute(`INSERT INTO SCRAPS (USER_ID, POST_ID) VALUES (:userId, :postId)`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'scrapped', isScrapped: true });
        }
    } catch (error) { console.error('\n🚨 [POST /scrap] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 2. 내 스크랩 목록 조회 API 
router.get('/scraps/my', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;

        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", 
                P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", 
                CASE 
                    WHEN P.UPDATED_AT IS NOT NULL 
                    THEN TO_CHAR(P.UPDATED_AT, 'YYYY-MM-DD HH24:MI') || ' (수정됨)' 
                    ELSE TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') 
                END AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID AND RP.STATUS = 'PUBLISHED'), 0) AS "quoteCount",
                1 AS "isScrapped" 
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            JOIN SCRAPS S ON P.ID = S.POST_ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE S.USER_ID = :userId AND P.STATUS = 'PUBLISHED'
            ORDER BY S.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const fullScraps = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            thumbnail: row.imageUrls ? row.imageUrls.split('|')[0] : '', images: row.imageUrls ? row.imageUrls.split('|') : [],       
            category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount, isScrapped: true,
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));
        res.json({ result: true, scraps: fullScraps });
    } catch (error) { console.error('\n🚨 [GET /scraps/my] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 게시물 수정 API
router.put('/:id', jwtAuthentication, async (req, res) => { 
    const postId = req.params.id;
    const { title, content, category } = req.body;
    
    let hashtags = [];
    if (req.body.hashtags) {
        try { hashtags = JSON.parse(req.body.hashtags); } 
        catch (e) { hashtags = [req.body.hashtags]; }
    }
    const userId = req.user?.id || req.userId;
    let connection;

    try {
        connection = await db.getConnection();
        const txOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false };

        const checkOwner = await connection.execute(`SELECT USER_ID FROM POSTS WHERE ID = :postId`, { postId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (checkOwner.rows.length === 0 || checkOwner.rows[0].USER_ID != userId) return res.status(403).json({ result: false, message: "수정 권한이 없습니다." });

        await connection.execute(
            `UPDATE POSTS SET TITLE = :title, CONTENT = :content, CATEGORY = :category, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = :postId`,
            { title: title || null, content, category: category || 'ETC', postId }, txOptions
        );
        await connection.execute(`DELETE FROM POST_HASHTAGS WHERE POST_ID = :postId`, { postId }, txOptions);
        
        if (hashtags && hashtags.length > 0) {
            for (let tagName of hashtags) {
                const cleanTagName = tagName.replace(/^#/, '').trim();
                if (!cleanTagName) continue;
                let currentHashtagId;
                const checkTag = await connection.execute(`SELECT ID FROM HASHTAGS WHERE NAME = :name`, { name: cleanTagName }, txOptions);
                if (checkTag.rows.length > 0) currentHashtagId = checkTag.rows[0].ID;
                else {
                    const ins = await connection.execute(`INSERT INTO HASHTAGS (NAME) VALUES (:name) RETURNING ID INTO :id`, { name: cleanTagName, id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } }, txOptions);
                    currentHashtagId = ins.outBinds.id[0];
                }
                await connection.execute(`INSERT INTO POST_HASHTAGS (POST_ID, HASHTAG_ID) VALUES (:postId, :hashtagId)`, { postId, hashtagId: currentHashtagId }, txOptions);
            }
        }
        await connection.commit();
        res.json({ result: true, message: "수정 성공" });
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch(e){} }
        console.error('\n🚨 [PUT /posts/:id] 에러:\n', error); res.status(500).json({ result: false, message: "서버 에러" });
    } finally { if (connection) await connection.close(); }
});

// 게시물 삭제 API 
router.delete('/:id', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const postId = req.params.id;
        const userId = req.user?.id || req.userId;

        const checkOwner = await connection.execute(`SELECT USER_ID FROM POSTS WHERE ID = :postId`, { postId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (checkOwner.rows.length === 0 || checkOwner.rows[0].USER_ID != userId) return res.status(403).json({ result: false, message: '삭제 권한이 없습니다.' });

        await connection.execute(`UPDATE POSTS SET STATUS = 'DELETED', DELETED_AT = CURRENT_TIMESTAMP WHERE ID = :postId`, { postId }, { autoCommit: true });
        res.json({ result: true, message: '게시물이 삭제되었습니다.' });
    } catch (error) { console.error('\n🚨 [DELETE /posts/:id] 에러:\n', error); res.status(500).json({ result: false, message: '서버 오류가 발생했습니다.' });
    } finally { if (connection) await connection.close(); }
});

// 조회수 증가
router.post('/:id/view', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.execute(
            `UPDATE POSTS SET VIEW_COUNT = VIEW_COUNT + 1 WHERE ID = :postId`,
            { postId: req.params.id }, { autoCommit: true }
        );
        res.json({ result: true });
    } catch (e) { res.status(500).json({ result: false }); }
    finally { if (connection) await connection.close(); }
});

// 게시물 통계
router.get('/my/stats', jwtAuthentication, async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const userId = req.user?.id || req.userId;

    const sql = `
      SELECT 
        COUNT(P.ID) AS "postCount",
        NVL(SUM((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID)), 0) AS "totalLikes",
        NVL(SUM((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED')), 0) AS "totalComments",
        NVL(SUM((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID AND RP.STATUS = 'PUBLISHED')), 0) AS "totalQuotes",
        NVL(SUM((SELECT COUNT(*) FROM SCRAPS WHERE POST_ID = P.ID)), 0) AS "totalScraps",
        NVL(SUM(P.VIEW_COUNT), 0) AS "totalViews"
      FROM POSTS P
      WHERE P.USER_ID = :userId AND P.STATUS = 'PUBLISHED'
    `;
    const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json({ result: true, stats: result.rows[0] });
  } catch (error) {
    console.error('통계 조회 에러:', error);
    res.status(500).json({ result: false });
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;