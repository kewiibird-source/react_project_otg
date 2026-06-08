const db = require('../db');

async function sendNotification(userId, senderId, type, targetId, message) {
    let connection;
    try {
        connection = await db.getConnection();
        const sql = `
            INSERT INTO "NOTIFICATIONS" (USER_ID, SENDER_ID, TYPE, TARGET_ID, MESSAGE) 
            VALUES (:userId, :senderId, :type, :targetId, :message)
        `;
        await connection.execute(sql, { userId, senderId, type, targetId, message }, { autoCommit: true });
    } catch (err) {
        console.error("알림 저장 실패:", err);
    } finally {
        if (connection) await connection.close();
    }
}

module.exports = { sendNotification };