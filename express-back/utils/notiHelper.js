const db = require('../db');

async function sendNotification(userId, senderId, type, targetId, message) {
    let connection;
    try {
        connection = await db.getConnection();
        const sql = `
            INSERT INTO "NOTIFICATIONS" (USER_ID, SENDER_ID, TYPE, TARGET_ID, MESSAGE) 
            VALUES (:userId, :senderId, :type, :targetId, :message)
        `;
        await connection.execute(sql, { userId, senderId, type, targetId, message }, { autoCommit: false });

        // 추가: 최근 20개를 초과하는 오래된 알림 삭제
        const cleanupSql = `
            DELETE FROM "NOTIFICATIONS"
            WHERE USER_ID = :userId
            AND NOTIFICATION_ID NOT IN (
                SELECT NOTIFICATION_ID FROM (
                    SELECT NOTIFICATION_ID FROM "NOTIFICATIONS"
                    WHERE USER_ID = :userId
                    ORDER BY CREATED_AT DESC
                ) WHERE ROWNUM <= 20
            )
        `;
        await connection.execute(cleanupSql, { userId }, { autoCommit: true });
        
    } catch (err) {
        console.error("알림 저장 실패:", err);
    } finally {
        if (connection) await connection.close();
    }
}

module.exports = { sendNotification };