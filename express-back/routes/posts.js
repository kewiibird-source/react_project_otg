const express = require('express');
const oracledb = require('oracledb');
const fs = require('fs');
const db = require("../db");
const jwtAuthentication = require('../auth'); 
const multer = require('multer');

oracledb.fetchAsString = [oracledb.CLOB];

const router = express.Router();

// 1. Multer 스토리지 설정 (파일명을 한글 깨짐 없이 현재 시간과 조합)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // 프로젝트 루트에 uploads 폴더 필수!
    },
    filename: (req, file, cb) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');        
        cb(null, Date.now() + '-' + decodedName);
    }
});

// ✨ 다중 파일 업로드를 위해 .array('images', 5) 사용 (최대 5장 제한 예시)
const upload = multer({ storage }); 

// 2. [핵심] 트랜잭션 기반 게시글 작성 라우터
router.post('/', jwtAuthentication, upload.array('images', 5), async (req, res) => {
    // Front에서 FormData로 보낸 텍스트 데이터 추출
    const { title, content, category = 'ETC', parentPostId } = req.body;
    // 해시태그는 배열 형태로 넘어온다고 가정 (예: ['#소주', '#삼겹살'])
    // FormData 특성상 텍스트로 오므로 JSON.parse 처리 필요할 수 있음
    let hashtags = [];
    if (req.body.hashtags) {
        try { hashtags = JSON.parse(req.body.hashtags); } 
        catch (e) { hashtags = [req.body.hashtags]; } // 단일 문자열일 경우 대비
    }

    const userId = req.user?.id || req.userId; 
    const files = req.files || []; // 업로드된 파일 배열
    
    let connection;

    try {
        connection = await db.getConnection();
        
        // ✨ 중요: 트랜잭션 관리를 위해 이 라우터에서는 autoCommit을 false로 설정합니다.
        const txOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false };

        // --- STEP 1: POSTS 테이블 INSERT ---
        // 썸네일 URL 조립 (첫 번째 이미지를 썸네일로 사용)
        let thumbnailUrl = null;
        const host = `${req.protocol}://${req.get('host')}/`;
        if (files.length > 0) {
            thumbnailUrl = host + files[0].destination + files[0].filename;
        }

        const insertPostSql = `
            INSERT INTO POSTS (USER_ID, TITLE, CONTENT, CATEGORY, THUMBNAIL_URL, CREATED_AT, PARENT_POST_ID)
            VALUES (:userId, :title, :content, :category, :thumbnailUrl, CURRENT_TIMESTAMP, :parentPostId)
            RETURNING ID INTO :insertId
        `;
        
        const postResult = await connection.execute(
            insertPostSql,
            { 
                userId, title, content, category, 
                thumbnailUrl: thumbnailUrl,
                parentPostId: parentPostId || null, // ✨ 인용글이 없으면 null 저장
                insertId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } 
            },
            txOptions
        );
        const newPostId = postResult.outBinds.insertId[0];

        // --- STEP 2: POST_IMAGES 테이블 INSERT ---
        if (files.length > 0) {
            const insertImageSql = `
                INSERT INTO POST_IMAGES (POST_ID, IMAGE_URL, SORT_ORDER, CREATED_AT)
                VALUES (:postId, :imageUrl, :sortOrder, CURRENT_TIMESTAMP)
            `;
            // for 루프 대신 Promise.all을 사용하여 병렬 처리 속도 향상
            const imagePromises = files.map((file, index) => {
                const imageUrl = host + file.destination + file.filename;
                return connection.execute(insertImageSql, { postId: newPostId, imageUrl, sortOrder: index + 1 }, txOptions);
            });
            await Promise.all(imagePromises);
        }

        // --- (이전 생략: STEP 1 게시글 INSERT, STEP 2 이미지 INSERT) ---

        // --- STEP 3: HASHTAGS & POST_HASHTAGS 테이블 INSERT ---
        if (hashtags && hashtags.length > 0) {
            // Promise.all 대신 for...of 루프 사용: 
            // 태그를 동시에 INSERT 하려다 DB에 동일한 신규 태그가 중복 생성되는 Race Condition 방지
            for (let tagName of hashtags) {
                // 1. 데이터 정제: 프론트에서 넘어온 태그명에서 '#' 기호 제거 및 양옆 공백 제거
                const cleanTagName = tagName.replace(/^#/, '').trim();
                if (!cleanTagName) continue; // 빈 태그는 무시

                let currentHashtagId;

                // 2. HASHTAGS 마스터 테이블에 해당 태그가 존재하는지 검색
                const checkHashtagSql = `SELECT ID FROM HASHTAGS WHERE NAME = :name`;
                const checkResult = await connection.execute(checkHashtagSql, { name: cleanTagName }, txOptions);

                if (checkResult.rows.length > 0) {
                    // 3-A. 이미 누군가 써서 존재하는 태그면 해당 ID 재활용
                    currentHashtagId = checkResult.rows[0].ID;
                } else {
                    // 3-B. 세상에 처음 등장한 신규 태그면 HASHTAGS 테이블에 새로 등록하고 ID 획득
                    const insertMasterSql = `
                        INSERT INTO HASHTAGS (NAME, CREATED_AT) 
                        VALUES (:name, CURRENT_TIMESTAMP) 
                        RETURNING ID INTO :newId
                    `;
                    const insertMasterResult = await connection.execute(
                        insertMasterSql, 
                        { 
                            name: cleanTagName, 
                            newId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } 
                        }, 
                        txOptions
                    );
                    currentHashtagId = insertMasterResult.outBinds.newId[0];
                }

                // 4. POST_HASHTAGS 매핑 테이블에 게시글ID - 해시태그ID 연결 기록
                const insertMappingSql = `
                    INSERT INTO POST_HASHTAGS (POST_ID, HASHTAG_ID, CREATED_AT)
                    VALUES (:postId, :hashtagId, CURRENT_TIMESTAMP)
                `;
                await connection.execute(
                    insertMappingSql, 
                    { postId: newPostId, hashtagId: currentHashtagId }, 
                    txOptions
                );
            }
        }

        // --- STEP 4: 모든 작업이 성공했으므로 COMMIT ---
        await connection.commit();

        res.json({
            result: true,
            message: "게시글이 성공적으로 등록되었습니다.",
            postId: newPostId
        });

    } catch (error) {
        console.error('게시글 트랜잭션 에러:', error);
        
        // 1. DB 롤백 (기존 코드 유지)
        if (connection) {
            try { await connection.rollback(); } catch (rollbackErr) { console.error('롤백 실패:', rollbackErr); }
        }

        // ✨ 2. 업로드된 쓰레기 파일 강제 삭제 로직 추가
        if (files && files.length > 0) {
            files.forEach(file => {
                // file.path는 uploads/파일명 형태로 저장되어 있음
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path); // 물리적 파일 삭제
                    console.log(`에러 발생으로 인해 파일 삭제됨: ${file.path}`);
                }
            });
        }

        res.status(500).json({ result: false, message: '서버 에러로 작성 취소됨.' });
    } finally {
        if (connection) await connection.close();
    }
});

// routes/posts.js 내부의 GET / 라우터 전체 교체
router.get('/', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        
        const sql = `
            SELECT 
                P.ID AS "id",
                U.NICKNAME AS "authorName",
                P.TITLE AS "title",
                P.CONTENT AS "content",
                (SELECT LISTAGG(PI.IMAGE_URL, '|') WITHIN GROUP (ORDER BY PI.SORT_ORDER)
                 FROM POST_IMAGES PI WHERE PI.POST_ID = P.ID) AS "imageUrls",
                P.CATEGORY AS "category",
                TO_CHAR(P.CREATED_AT, 'YYYY-MM-DD HH24:MI') AS "createdAt",
                (SELECT LISTAGG(H.NAME, ',') WITHIN GROUP (ORDER BY H.NAME)
                 FROM POST_HASHTAGS PH JOIN HASHTAGS H ON PH.HASHTAG_ID = H.ID
                 WHERE PH.POST_ID = P.ID) AS "hashtags",
                
                P.PARENT_POST_ID AS "parentPostId",
                PP.TITLE AS "parentTitle",
                PP.CONTENT AS "parentContent",
                PP.THUMBNAIL_URL AS "parentImageUrl",
                PU.NICKNAME AS "parentAuthorName"
            FROM POSTS P
            JOIN USERS U ON P.USER_ID = U.ID
            LEFT JOIN POSTS PP ON P.PARENT_POST_ID = PP.ID
            LEFT JOIN USERS PU ON PP.USER_ID = PU.ID
            ORDER BY P.CREATED_AT DESC
        `;
        
        const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const cleanPosts = result.rows.map(row => ({
            id: row.id,
            authorName: row.authorName,
            title: row.title,
            content: row.content,
            images: row.imageUrls ? row.imageUrls.split('|') : [],
            category: row.category,
            createdAt: row.createdAt,
            hashtags: row.hashtags ? row.hashtags.split(',') : [],
            // ✨ 프론트엔드로 넘겨줄 부모 게시글 데이터 묶음
            parentPost: row.parentPostId ? {
                id: row.parentPostId,
                title: row.parentTitle,
                content: row.parentContent,
                imageUrl: row.parentImageUrl,
                authorName: row.parentAuthorName
            } : null
        }));

        res.json({ result: true, posts: cleanPosts });

    } catch (error) {
        console.error('조회 에러 상세:', error);
        res.status(500).json({ result: false, message: '조회 실패' });
    } finally {
        if (connection) await connection.close();
    }
});

module.exports = router;