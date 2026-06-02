// express-back/auth.js

const jwt = require('jsonwebtoken');

const jwtAuthentication = (req, res, next) => {
    // 1. 프론트엔드가 보낸 헤더에서 토큰 꺼내기
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ result: false, message: '로그인이 필요한 서비스입니다.' });
    }

    // "Bearer 토큰값" 에서 토큰값만 분리
    const token = authHeader.split(' ')[1];

    try {
        // 2. 토큰 검증 (user.js에서 로그인할 때 토큰을 만들었던 그 비밀키를 사용)
        // 주의: .env 파일에 JWT_SECRET 이 설정되어 있어야 합니다.
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. 해독된 유저 정보(id)를 req 객체에 담아서 다음 라우터(posts.js)로 넘겨줌
        req.userId = decoded.id; 
        
        // 무사히 검문을 통과했으니 다음 할 일(글쓰기 로직)을 하러 가라는 명령어
        next();
    } catch (error) {
        console.error('토큰 검증 에러:', error);
        return res.status(403).json({ result: false, message: '유효하지 않거나 만료된 로그인 정보입니다.' });
    }
};

module.exports = jwtAuthentication;