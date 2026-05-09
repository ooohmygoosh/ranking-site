const jwt = require('jsonwebtoken');
const { findUserById } = require('./store');

const SECRET = 'rank-site-secret-2026';

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '需要登录' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET);
    const user = findUserById(payload.userId);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    next();
  } catch (err) {
    return res.status(401).json({ error: '无效令牌' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: '管理员权限不足' });
  }
  next();
}

module.exports = {
  auth,
  adminOnly,
  SECRET
};
