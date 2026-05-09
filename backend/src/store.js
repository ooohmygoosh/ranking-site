const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const filePath = path.join(__dirname, '../data/store.json');
const DEFAULT_TIERS = ['夯', '顶级', '人上人', 'NPC', '拉完了'];
const SETTLE_INTERVAL_MS = 60 * 60 * 1000;

function isImageValue(value) {
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value || '');
}

function normalizeOption(item, index = 0) {
  const raw = typeof item === 'string' ? { name: item } : item || {};
  return {
    id: raw.id || uuid(),
    name: raw.name || raw.itemName || '新选项',
    kind: raw.kind || (raw.imageUrl ? 'image' : 'text'),
    imageUrl: raw.imageUrl || raw.itemImageUrl || '',
    tierIndex: Number.isFinite(raw.tierIndex) ? raw.tierIndex : Math.min(index, DEFAULT_TIERS.length - 1)
  };
}

function normalizeList(list) {
  const tiers = Array.isArray(list.tiers) && list.tiers.length > 0 ? list.tiers : DEFAULT_TIERS;
  return {
    ...list,
    id: list.id || uuid(),
    title: list.title || '从夯到拉榜单',
    description: list.description || '大家一起排序，每小时根据意愿更新一次。',
    coverImageUrl: list.coverImageUrl || '',
    type: 'firepower',
    tiers,
    heat: Number.isFinite(list.heat) ? list.heat : 0,
    lastSettledAt: list.lastSettledAt || new Date().toISOString(),
    items: (list.items || []).map((item, index) => {
      const normalized = normalizeOption(item, index);
      return {
        ...normalized,
        tierIndex: Math.max(0, Math.min(tiers.length - 1, normalized.tierIndex))
      };
    })
  };
}

function defaultData() {
  return {
    users: [
      {
        id: 'user-admin',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        isAdmin: true
      },
      {
        id: 'user-guest',
        username: 'guest',
        password: bcrypt.hashSync('guest123', 10),
        isAdmin: false
      }
    ],
    rankLists: [
      normalizeList({
        id: 'default',
        title: '从夯到拉总榜',
        description: '把选项拖进你认为合适的档位，整点后系统按大家的意愿更新。',
        coverImageUrl: '',
        items: [
          { id: uuid(), name: '最强选手', tierIndex: 0 },
          { id: uuid(), name: '人气作品', tierIndex: 1 },
          { id: uuid(), name: '最佳案例', tierIndex: 2 },
          { id: uuid(), name: '爆款项目', tierIndex: 3 },
          { id: uuid(), name: '离谱操作', tierIndex: 4 }
        ]
      })
    ],
    submissions: [],
    candidates: [],
    proposals: []
  };
}

function ensureStore() {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData(), null, 2), 'utf8');
  }
}

function writeStore(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function migrateData(data) {
  let changed = false;
  if (!Array.isArray(data.rankLists)) {
    data.rankLists = defaultData().rankLists;
    changed = true;
  }
  if (!Array.isArray(data.submissions)) {
    data.submissions = [];
    changed = true;
  }
  if (!Array.isArray(data.candidates)) {
    data.candidates = [];
    changed = true;
  }
  data.rankLists = data.rankLists.map((list) => {
    const normalized = normalizeList(list);
    if (JSON.stringify(normalized) !== JSON.stringify(list)) changed = true;
    return normalized;
  });
  data.candidates = data.candidates.map((candidate) => ({
    ...candidate,
    id: candidate.id || uuid(),
    kind: candidate.kind || (candidate.imageUrl ? 'image' : 'text'),
    imageUrl: candidate.imageUrl || '',
    supportUserIds: Array.isArray(candidate.supportUserIds) ? candidate.supportUserIds : [],
    status: candidate.status || 'pending',
    createdAt: candidate.createdAt || new Date().toISOString()
  }));
  return { data, changed };
}

function readRawStore() {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const { data, changed } = migrateData(parsed);
  if (changed) writeStore(data);
  return data;
}

function getDueListIds(data, now = Date.now()) {
  return data.rankLists
    .filter((list) => now - new Date(list.lastSettledAt).getTime() >= SETTLE_INTERVAL_MS)
    .map((list) => list.id);
}

function countBy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return counts;
}

function settleList(data, listId, nowIso = new Date().toISOString()) {
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return;
  const tierMax = list.tiers.length - 1;
  const submissions = data.submissions.filter(
    (submission) => submission.listId === listId && submission.status === 'pending'
  );
  const uniqueUsers = new Set(submissions.map((submission) => submission.userId));

  list.items = list.items.filter((item) => {
    const deleteCount = submissions.filter((submission) => submission.deleteItemIds.includes(item.id)).length;
    const deleteThreshold = Math.max(3, Math.ceil(Math.max(uniqueUsers.size, 1) * 0.5));
    return deleteCount < deleteThreshold;
  });

  list.items.forEach((item) => {
    const targetVotes = submissions
      .map((submission) => submission.placements.find((placement) => placement.itemId === item.id))
      .filter(Boolean)
      .map((placement) => Math.max(0, Math.min(tierMax, placement.tierIndex)));
    if (targetVotes.length === 0) return;
    const counts = countBy(targetVotes);
    const [bestTier] = Array.from(counts.entries()).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return Math.abs(left[0] - item.tierIndex) - Math.abs(right[0] - item.tierIndex);
    })[0];
    item.tierIndex = bestTier;
  });

  list.tiers.forEach((_, tierIndex) => {
    const accepted = data.candidates
      .filter(
        (candidate) =>
          candidate.listId === listId && candidate.status === 'pending' && candidate.tierIndex === tierIndex
      )
      .sort((left, right) => right.supportUserIds.length - left.supportUserIds.length)
      .slice(0, 5);
    accepted.forEach((candidate) => {
      list.items.push({
        id: uuid(),
        name: candidate.name,
        kind: candidate.kind,
        imageUrl: candidate.imageUrl,
        tierIndex
      });
      candidate.status = 'accepted';
      candidate.acceptedAt = nowIso;
    });
  });

  submissions.forEach((submission) => {
    submission.status = 'settled';
    submission.settledAt = nowIso;
  });
  list.heat =
    data.submissions.filter((submission) => submission.listId === listId).length +
    data.candidates
      .filter((candidate) => candidate.listId === listId)
      .reduce((total, candidate) => total + Math.max(1, candidate.supportUserIds.length), 0);
  list.lastSettledAt = nowIso;
}

function readStore() {
  const data = readRawStore();
  const dueListIds = getDueListIds(data);
  if (dueListIds.length > 0) {
    dueListIds.forEach((listId) => settleList(data, listId));
    writeStore(data);
  }
  return data;
}

function findUserByUsername(username) {
  const data = readStore();
  return data.users.find((user) => user.username === username);
}

function findUserById(id) {
  const data = readStore();
  return data.users.find((user) => user.id === id);
}

function createUser(username, password, isAdmin = false) {
  const data = readStore();
  if (data.users.find((user) => user.username === username)) return null;
  const newUser = {
    id: uuid(),
    username,
    password: bcrypt.hashSync(password, 10),
    isAdmin
  };
  data.users.push(newUser);
  writeStore(data);
  return newUser;
}

function getAllLists() {
  const data = readStore();
  return data.rankLists
    .map((list) => ({
      ...list,
      itemCount: list.items.length,
      pendingCandidateCount: data.candidates.filter(
        (candidate) => candidate.listId === list.id && candidate.status === 'pending'
      ).length
    }))
    .sort((left, right) => right.heat - left.heat);
}

function getListById(id) {
  const data = readStore();
  return data.rankLists.find((list) => list.id === id) || null;
}

function createList({ title, description, coverImageUrl, items }) {
  const data = readStore();
  const list = normalizeList({
    id: uuid(),
    title,
    description,
    coverImageUrl,
    items: (items || []).map((item, index) => normalizeOption(item, Math.min(index, DEFAULT_TIERS.length - 1)))
  });
  data.rankLists.push(list);
  writeStore(data);
  return list;
}

function updateList(id, updates) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === id);
  if (!list) return null;
  if (updates.title) list.title = updates.title;
  if (updates.description !== undefined) list.description = updates.description;
  if (updates.coverImageUrl !== undefined) list.coverImageUrl = updates.coverImageUrl;
  writeStore(data);
  return list;
}

function createSubmission(listId, payload, user) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;
  const tierMax = list.tiers.length - 1;
  const validItemIds = new Set(list.items.map((item) => item.id));
  const submission = {
    id: uuid(),
    listId,
    userId: user.id,
    username: user.username,
    placements: (payload.placements || [])
      .filter((placement) => validItemIds.has(placement.itemId))
      .map((placement) => ({
        itemId: placement.itemId,
        tierIndex: Math.max(0, Math.min(tierMax, Number(placement.tierIndex)))
      })),
    deleteItemIds: (payload.deleteItemIds || []).filter((itemId) => validItemIds.has(itemId)),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.submissions.push(submission);
  const listRef = data.rankLists.find((item) => item.id === listId);
  listRef.heat += 1;
  writeStore(data);
  return submission;
}

function createCandidate(listId, payload, user) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;
  const rawValue = (payload.imageUrl || payload.name || '').trim();
  const imageUrl = payload.imageUrl || (isImageValue(rawValue) ? rawValue : '');
  const candidate = {
    id: uuid(),
    listId,
    tierIndex: Math.max(0, Math.min(list.tiers.length - 1, Number(payload.tierIndex))),
    name: payload.name || (imageUrl ? '图片选项' : '新选项'),
    kind: imageUrl ? 'image' : 'text',
    imageUrl,
    createdBy: user.id,
    createdByName: user.username,
    supportUserIds: [user.id],
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.candidates.push(candidate);
  list.heat += 1;
  writeStore(data);
  return candidate;
}

function supportCandidate(candidateId, user) {
  const data = readStore();
  const candidate = data.candidates.find((item) => item.id === candidateId && item.status === 'pending');
  if (!candidate) return null;
  if (!candidate.supportUserIds.includes(user.id)) {
    candidate.supportUserIds.push(user.id);
    const list = data.rankLists.find((item) => item.id === candidate.listId);
    if (list) list.heat += 1;
  }
  writeStore(data);
  return candidate;
}

function getListSummary(listId) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;
  const pendingSubmissions = data.submissions.filter(
    (submission) => submission.listId === listId && submission.status === 'pending'
  );
  const itemIntent = {};
  list.items.forEach((item) => {
    const targetCounts = {};
    let deleteCount = 0;
    pendingSubmissions.forEach((submission) => {
      if (submission.deleteItemIds.includes(item.id)) deleteCount += 1;
      const placement = submission.placements.find((entry) => entry.itemId === item.id);
      if (placement) targetCounts[placement.tierIndex] = (targetCounts[placement.tierIndex] || 0) + 1;
    });
    itemIntent[item.id] = { targetCounts, deleteCount };
  });
  const candidates = data.candidates
    .filter((candidate) => candidate.listId === listId && candidate.status === 'pending')
    .map((candidate) => ({
      ...candidate,
      supportCount: candidate.supportUserIds.length
    }));
  return {
    listId,
    nextSettlementAt: new Date(new Date(list.lastSettledAt).getTime() + SETTLE_INTERVAL_MS).toISOString(),
    pendingSubmissionCount: pendingSubmissions.length,
    itemIntent,
    candidates
  };
}

module.exports = {
  DEFAULT_TIERS,
  findUserByUsername,
  findUserById,
  createUser,
  getAllLists,
  getListById,
  createList,
  updateList,
  createSubmission,
  createCandidate,
  supportCandidate,
  getListSummary
};
