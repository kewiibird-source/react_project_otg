const express = require('express');
const oracledb = require('oracledb');
const fs = require('fs');
const db = require("../db");
const jwtAuthentication = require('../auth'); 
const multer = require('multer');

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

// 1. 게시글 작성
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
            INSERT INTO POSTS (USER_ID, TITLE, CONTENT, CATEGORY, THUMBNAIL_URL, CREATED_AT, PARENT_POST_ID)
            VALUES (:userId, :title, :content, :category, :thumbnailUrl, CURRENT_TIMESTAMP, :parentPostId)
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
    } catch (error) {
        if (connection) { try { await connection.rollback(); } catch (e) {} }
        if (files.length > 0) files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        console.error('\n🚨 [POST /] 글 작성 에러:\n', error); res.status(500).json({ result: false });
    } finally { if (connection) await connection.close(); }
});

// ✨ 2. 내 게시글 조회 (authorProfileImage 추가)
router.get('/my', jwtAuthentication, async (req, res) => {
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
                P.CATEGORY AS "category", TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID), 0) AS "quoteCount"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE P.USER_ID = :userId
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const myPosts = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            thumbnail: row.imageUrls ? row.imageUrls.split('|')[0] : '', images: row.imageUrls ? row.imageUrls.split('|') : [],       
            category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount, 
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));
        
        res.json({ result: true, posts: myPosts, postCount: myPosts.length, followerCount: stats.FOLLOWER_COUNT, followingCount: stats.FOLLOWING_COUNT, bio: stats.BIO, profileImage: stats.PROFILE_IMAGE });
    } catch (error) { console.error('\n🚨 [GET /my] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// ✨ 3. 전체 피드 조회 (authorProfileImage 추가)
router.get('/', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;

        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID), 0) AS "quoteCount"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const cleanPosts = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', title: row.title, content: row.content,
            images: row.imageUrls ? row.imageUrls.split('|') : [], category: row.category, createdAt: row.createdAt, hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, commentCount: row.commentCount, quoteCount: row.quoteCount, 
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));
        res.json({ result: true, posts: cleanPosts });
    } catch (error) { console.error('\n🚨 [GET /] 홈 피드 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

// 4. 좋아요 토글 
router.post('/:id/like', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const postId = req.params.id;

        const checkResult = await connection.execute(`SELECT ID FROM LIKES WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId });
        if (checkResult.rows.length > 0) {
            await connection.execute(`DELETE FROM LIKES WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'unliked' });
        } else {
            await connection.execute(`INSERT INTO LIKES (USER_ID, POST_ID) VALUES (:userId, :postId)`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'liked' });
        }
    } catch (error) { console.error('\n🚨 [POST /like] 에러:\n', error); res.status(500).json({ result: false }); } 
    finally { if (connection) await connection.close(); }
});

// 5. 댓글 작성 
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

// ✨ 7. 댓글 조회 (authorProfileImage 추가)
router.get('/:id/comments', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const sql = `
            SELECT C.ID AS "id", C.CONTENT AS "content", TO_CHAR(C.CREATED_AT, 'MM-DD HH24:MI') AS "createdAt", 
                   U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", C.PARENT_COMMENT_ID AS "parentCommentId"
            FROM COMMENTS C JOIN USERS U ON C.USER_ID = U.ID
            WHERE C.POST_ID = :postId AND C.STATUS = 'PUBLISHED'
            ORDER BY NVL(C.PARENT_COMMENT_ID, C.ID) ASC, C.ID ASC
        `;
        const result = await connection.execute(sql, { postId: req.params.id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ result: true, comments: result.rows });
    } catch (error) { console.error('\n🚨 [GET /comments] 에러:\n', error); res.status(500).json({ result: false }); } 
    finally { if (connection) await connection.close(); }
});

// ✨ 8. 특정 유저 프로필 피드 조회 (authorProfileImage 추가)
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
                P.CATEGORY AS "category", TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :currentUserId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID), 0) AS "quoteCount"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE P.USER_ID = :targetUserId
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

// 9. 팔로우 / 언팔로우 토글 API
router.post('/user/:nickname/follow', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const followerId = req.user?.id || req.userId;
        const targetNickname = req.params.nickname;

        const userCheck = await connection.execute(`SELECT ID FROM USERS WHERE NICKNAME = :nickname`, { nickname: targetNickname }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (userCheck.rows.length === 0) return res.status(404).json({ result: false, message: '유저를 찾을 수 없습니다.' });
        
        const followingId = userCheck.rows[0].ID;
        if (followerId === followingId) return res.json({ result: false, message: '자신을 팔로우할 수 없습니다.' });

        const checkFollow = await connection.execute(`SELECT ID FROM FOLLOWS WHERE FOLLOWER_ID = :followerId AND FOLLOWING_ID = :followingId`, { followerId, followingId });
        if (checkFollow.rows.length > 0) {
            await connection.execute(`DELETE FROM FOLLOWS WHERE FOLLOWER_ID = :followerId AND FOLLOWING_ID = :followingId`, { followerId, followingId }, { autoCommit: true });
            res.json({ result: true, isFollowing: false }); 
        } else {
            await connection.execute(`INSERT INTO FOLLOWS (FOLLOWER_ID, FOLLOWING_ID) VALUES (:followerId, :followingId)`, { followerId, followingId }, { autoCommit: true });
            res.json({ result: true, isFollowing: true }); 
        }
    } catch (error) { console.error('\n🚨 [POST /follow] 에러:\n', error); res.status(500).json({ result: false }); 
    } finally { if (connection) await connection.close(); }
});

module.exports = router;