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

// routes/posts.js 의 3. 전체 피드 조회 API
router.get('/', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;

        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", 
                P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID), 0) AS "quoteCount",
                (SELECT COUNT(*) FROM SCRAPS WHERE POST_ID = P.ID AND USER_ID = :userId) AS "isScrapped"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            ORDER BY P.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const cleanPosts = result.rows.map(row => ({
            id: row.id, 
            authorName: row.authorName, 
            authorProfileImage: row.authorProfileImage || '', 
            title: row.title, 
            content: row.content,
            images: row.imageUrls ? row.imageUrls.split('|') : [], 
            category: row.category, 
            createdAt: row.createdAt, 
            hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, 
            isLiked: row.isLiked > 0, 
            commentCount: row.commentCount, 
            quoteCount: row.quoteCount, 
            isScrapped: row.isScrapped > 0, // ✨ row.isScrapped 결과가 1 이상이면 true
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

// ✨ 6.5 댓글 삭제 (Soft Delete 적용)
router.delete('/comments/:commentId', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const commentId = req.params.commentId;
        
        // 왜(Why)?: DELETE 문 대신 UPDATE 문을 사용하여 'STATUS'만 변경합니다.
        // 이렇게 하면 대댓글이 참조하는 부모 ID(FK 제약조건) 오류를 방지하고, 
        // 향후 운영 단계에서 악성 유저의 데이터 복구 및 증거 보존이 가능합니다.
        const sql = `
            UPDATE COMMENTS 
            SET STATUS = 'DELETED', UPDATED_AT = CURRENT_TIMESTAMP 
            WHERE ID = :commentId AND USER_ID = :userId
        `;
        
        const result = await connection.execute(
            sql, 
            { commentId, userId }, 
            { autoCommit: true }
        );

        // 왜(Why)?: 조건(ID와 USER_ID)에 맞는 데이터가 없으면 변경된 행(rowsAffected)이 0입니다.
        // 이는 존재하지 않는 댓글이거나, 다른 유저의 댓글을 삭제하려는 시도(보안 위협)를 의미합니다.
        if (result.rowsAffected > 0) {
            res.json({ result: true, message: '댓글이 성공적으로 삭제되었습니다.' });
        } else {
            // 403 Forbidden: 인증은 되었으나 해당 리소스에 대한 권한이 없음
            res.status(403).json({ result: false, message: '삭제 권한이 없거나 존재하지 않는 댓글입니다.' });
        }
    } catch (error) { 
        console.error('\n🚨 [DELETE /comments/:commentId] 에러:\n', error); 
        res.status(500).json({ result: false, message: '서버 오류가 발생했습니다.' }); 
    } finally { 
        if (connection) await connection.close(); 
    }
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

// ✨ 수정 후: '/user/:nickname/:type' 
router.get('/user/:nickname/:type', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        const { nickname, type } = req.params;

        // 1. 여기서 타입을 직접 검증합니다. (더 확실하고 안전함)
        if (type !== 'followers' && type !== 'following') {
            return res.status(400).json({ result: false, message: '잘못된 접근입니다.' });
        }

        connection = await db.getConnection();
        const myId = req.user?.id || req.userId;

        const userCheck = await connection.execute(`SELECT ID FROM USERS WHERE NICKNAME = :nickname`, { nickname });
        if (userCheck.rows.length === 0) return res.status(404).json({ result: false, message: '유저를 찾을 수 없습니다.' });
        const targetId = userCheck.rows[0].ID;

        // 2. 검증이 끝난 후 안전하게 SQL 실행
        const sql = type === 'followers' 
            ? `SELECT U.ID, U.NICKNAME, U.PROFILE_IMAGE, 
                      (SELECT COUNT(*) FROM FOLLOWS WHERE FOLLOWER_ID = :myId AND FOLLOWING_ID = U.ID) AS IS_FOLLOWING
               FROM FOLLOWS F JOIN USERS U ON F.FOLLOWER_ID = U.ID WHERE F.FOLLOWING_ID = :targetId`
            : `SELECT U.ID, U.NICKNAME, U.PROFILE_IMAGE, 
                      1 AS IS_FOLLOWING
               FROM FOLLOWS F JOIN USERS U ON F.FOLLOWING_ID = U.ID WHERE F.FOLLOWER_ID = :targetId`;
            
        const result = await connection.execute(sql, { myId, targetId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ result: true, list: result.rows });
    } catch (error) { 
        console.error('\n🚨 [GET /user/:nickname/:type] 에러:\n', error); 
        res.status(500).json({ result: false }); 
    } finally { 
        if (connection) await connection.close(); 
    }
});

// ✨ 1. 스크랩(보관함) 토글 API
// 왜(Why)?: 이미 생성된 SCRAPS 테이블을 활용하여 넣고 빼는 로직입니다.
router.post('/:id/scrap', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const postId = req.params.id;

        const checkResult = await connection.execute(
            `SELECT ID FROM SCRAPS WHERE USER_ID = :userId AND POST_ID = :postId`, 
            { userId, postId }
        );

        if (checkResult.rows.length > 0) {
            await connection.execute(`DELETE FROM SCRAPS WHERE USER_ID = :userId AND POST_ID = :postId`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'unscrapped', isScrapped: false });
        } else {
            await connection.execute(`INSERT INTO SCRAPS (USER_ID, POST_ID) VALUES (:userId, :postId)`, { userId, postId }, { autoCommit: true });
            res.json({ result: true, message: 'scrapped', isScrapped: true });
        }
    } catch (error) { 
        console.error('\n🚨 [POST /scrap] 에러:\n', error); 
        res.status(500).json({ result: false }); 
    } finally { 
        if (connection) await connection.close(); 
    }
});

// ✨ 2. 내 스크랩 목록 조회 API (모달 연동 및 다중 검색용)
router.get('/scraps/my', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;

        // 왜(Why)?: 모달을 띄우려면 본문 내용, 해시태그, 좋아요 수 등 전체 정보가 필요합니다.
        // SCRAPS 테이블과 JOIN하되, 메인 피드와 동일한 컬럼들을 Select 합니다.
        const sql = `
            SELECT 
                P.ID AS "id", U.NICKNAME AS "authorName", U.PROFILE_IMAGE AS "authorProfileImage", 
                P.TITLE AS "title", P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER) FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category", TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME) FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID WHERE PH.POST_ID = P.ID) AS "hashtags",
                P.PARENT_POST_ID AS "parentPostId", PP.TITLE AS "parentTitle", PP.CONTENT AS "parentContent", PP.THUMBNAIL_URL AS "parentImageUrl", PU.NICKNAME AS "parentAuthorName",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID), 0) AS "likeCount",
                NVL((SELECT COUNT(*) FROM LIKES WHERE POST_ID = P.ID AND USER_ID = :userId), 0) AS "isLiked",
                NVL((SELECT COUNT(*) FROM COMMENTS C WHERE C.POST_ID = P.ID AND C.STATUS = 'PUBLISHED'), 0) AS "commentCount",
                NVL((SELECT COUNT(*) FROM POSTS RP WHERE RP.PARENT_POST_ID = P.ID), 0) AS "quoteCount",
                1 AS "isScrapped" -- 스크랩 탭이므로 무조건 1(true) 반환
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            JOIN SCRAPS S ON P.ID = S.POST_ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            WHERE S.USER_ID = :userId
            ORDER BY S.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        // 프론트엔드 모달이 요구하는 객체 구조로 파싱
        const fullScraps = result.rows.map(row => ({
            id: row.id, authorName: row.authorName, authorProfileImage: row.authorProfileImage || '', 
            title: row.title, content: row.content,
            thumbnail: row.imageUrls ? row.imageUrls.split('|')[0] : '', 
            images: row.imageUrls ? row.imageUrls.split('|') : [],       
            category: row.category, createdAt: row.createdAt, 
            hashtags: row.hashtags ? row.hashtags.split(',') : [],
            likeCount: row.likeCount, isLiked: row.isLiked > 0, 
            commentCount: row.commentCount, quoteCount: row.quoteCount, isScrapped: true,
            parentPost: row.parentPostId ? { id: row.parentPostId, title: row.parentTitle, content: row.parentContent, imageUrl: row.parentImageUrl, authorName: row.parentAuthorName } : null
        }));

        res.json({ result: true, scraps: fullScraps });
    } catch (error) { 
        console.error('\n🚨 [GET /scraps/my] 에러:\n', error); 
        res.status(500).json({ result: false }); 
    } finally { 
        if (connection) await connection.close(); 
    }
});

module.exports = router;