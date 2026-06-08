const express = require('express');
const router = express.Router();
const db = require('../db');
const jwtAuthentication = require('../auth');
const oracledb = require('oracledb');

// 1. 알림 목록 조회
router.get('/', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const sql = `
            SELECT 
                N.NOTIFICATION_ID AS "id", 
                N.TYPE AS "type", 
                N.TARGET_ID AS "targetId", 
                N.MESSAGE AS "message", 
                N.IS_READ AS "isRead", 
                TO_CHAR(N.CREATED_AT, 'MM-DD HH24:MI') AS "createdAt",
                U.NICKNAME AS "senderName", 
                U.PROFILE_IMAGE AS "senderProfileImage"
            FROM "NOTIFICATIONS" N  
            LEFT JOIN USERS U ON N.SENDER_ID = U.ID
            WHERE N.USER_ID = :userId 
            ORDER BY N.CREATED_AT DESC
        `;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }); 
        res.json({ result: true, notifications: result.rows });
    } catch (error) {
        console.error('알림 목록 조회 에러:', error);
        res.status(500).json({ result: false });
    } finally { 
        if (connection) await connection.close(); 
    }
});

// 2. 알림 읽음 처리
router.patch('/:id/read', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        await connection.execute(
            `UPDATE "NOTIFICATIONS" SET IS_READ = 'Y' WHERE NOTIFICATION_ID = :id`, 
            { id: req.params.id }, 
            { autoCommit: true }
        );
        res.json({ result: true });
    } catch (error) {
        res.status(500).json({ result: false });
    } finally { 
        if (connection) await connection.close(); 
    }
});

// 3. 알림 개수 조회
router.get('/count', jwtAuthentication, async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        
        const sql = `SELECT COUNT(*) AS "count" FROM "NOTIFICATIONS" WHERE USER_ID = :userId AND IS_READ = 'N'`;
        const result = await connection.execute(sql, { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }); 
        
        res.json({ result: true, count: result.rows[0].count });
    } catch (error) {
        console.error('알림 개수 조회 실패:', error);
        res.status(500).json({ result: false });
    } finally {
        if (connection) await connection.close();
    }
});
module.exports = router;