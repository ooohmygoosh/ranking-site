const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const filePath = path.join(__dirname, '../data/store.json');
const uploadDir = path.join(__dirname, '../data/uploads');
let storeCache = null;
const DEFAULT_TIERS = ['夯', '顶级', '人上人', 'NPC', '拉完了'];
const STRESS_MEMES = [
  { name: '黑神话：悟空', tierIndex: 0, supportCount: 36 },
  { name: '遥遥领先', tierIndex: 0, supportCount: 34 },
  { name: '含金量还在上升', tierIndex: 0, supportCount: 31 },
  { name: '偏偏你最争气', tierIndex: 0, supportCount: 28 },
  { name: '小孩哥 / 小孩姐', tierIndex: 0, supportCount: 25 },
  { name: 'City不City', tierIndex: 1, supportCount: 24 },
  { name: '松弛感', tierIndex: 1, supportCount: 22 },
  { name: '硬控', tierIndex: 1, supportCount: 20 },
  { name: '主理人', tierIndex: 1, supportCount: 18 },
  { name: '公主 / 王子，请上车', tierIndex: 1, supportCount: 16 },
  { name: 'i人 / e人', tierIndex: 2, supportCount: 15 },
  { name: '显眼包', tierIndex: 2, supportCount: 14 },
  { name: '多巴胺穿搭', tierIndex: 2, supportCount: 13 },
  { name: '浓人淡人', tierIndex: 2, supportCount: 12 },
  { name: '电子榨菜', tierIndex: 2, supportCount: 11 },
  { name: '班味儿', tierIndex: 3, supportCount: 10 },
  { name: '特种兵旅游', tierIndex: 3, supportCount: 9 },
  { name: '水灵灵地', tierIndex: 3, supportCount: 8 },
  { name: '脆皮大学生', tierIndex: 3, supportCount: 7 },
  { name: '退一万步讲', tierIndex: 3, supportCount: 6 },
  { name: '孔乙己文学', tierIndex: 4, supportCount: 5 },
  { name: 'X门', tierIndex: 4, supportCount: 5 },
  { name: '挖呀挖呀挖', tierIndex: 4, supportCount: 4 },
  { name: '尊嘟假嘟', tierIndex: 4, supportCount: 4 },
  { name: '鼠鼠我鸭', tierIndex: 4, supportCount: 3 },
  { name: '不是哥们', tierIndex: 4, supportCount: 3 },
  { name: '包的', tierIndex: 3, supportCount: 6 },
  { name: '这河狸吗', tierIndex: 3, supportCount: 6 },
  { name: '哈基米', tierIndex: 2, supportCount: 9 },
  { name: '草台班子', tierIndex: 4, supportCount: 4 }
];

function isImageValue(value) {
  return /^(https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?|data:image\/[^;]+;base64,.+)$/i.test(
    value || ''
  );
}

function nextHourAfter(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return nextHourAfter(new Date().toISOString());
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

function imageExtension(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

function persistImageUrl(value) {
  const source = String(value || '');
  const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return source;

  ensureUploadDir();
  const filename = `${uuid()}.${imageExtension(match[1])}`;
  fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(match[2], 'base64'));
  return `/api/uploads/${filename}`;
}

function normalizeOption(item, index = 0) {
  const raw = typeof item === 'string' ? { name: item } : item || {};
  return {
    id: raw.id || uuid(),
    name: raw.name || raw.itemName || '新选项',
    kind: raw.kind || (raw.imageUrl ? 'image' : 'text'),
    imageUrl: persistImageUrl(raw.imageUrl || raw.itemImageUrl || ''),
    tierIndex: Number.isFinite(raw.tierIndex) ? raw.tierIndex : Math.min(index, DEFAULT_TIERS.length - 1),
    order: Number.isFinite(raw.order) ? raw.order : index
  };
}

function normalizeList(list) {
  const tiers = Array.isArray(list.tiers) && list.tiers.length > 0 ? list.tiers : DEFAULT_TIERS;
  return {
    ...list,
    id: list.id || uuid(),
    title: list.title || '从夯到拉榜单',
    description: list.description || '大家一起排序，每个整点根据意愿更新一次。',
    coverImageUrl: persistImageUrl(list.coverImageUrl || ''),
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

function getSummaryCoverImageUrl(list) {
  const value = list.coverImageUrl || '';
  if (value.startsWith('data:image/') && value.length > 350000) return '';
  if (value.startsWith('/api/uploads/')) {
    const filename = path.basename(value);
    const fullPath = path.join(uploadDir, filename);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 350000) return '';
  }
  return value;
}

function defaultData() {
  return {
    users: [
      {
        id: 'user-admin',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        isAdmin: true
      }
    ],
    rankLists: [
      normalizeList({
        id: 'default',
        title: '从夯到拉总榜',
        description: '拖动选项到你认为合适的档位，提交后系统会在下个整点结算。',
        coverImageUrl: '',
        items: [
          { id: uuid(), name: '最强选手', tierIndex: 0, order: 0 },
          { id: uuid(), name: '人气作品', tierIndex: 1, order: 0 },
          { id: uuid(), name: '最佳搭档', tierIndex: 2, order: 0 },
          { id: uuid(), name: '普通项目', tierIndex: 3, order: 0 },
          { id: uuid(), name: '离谱操作', tierIndex: 4, order: 0 }
        ]
      })
    ],
    submissions: [],
    candidates: [],
    comments: [],
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
  storeCache = data;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function recomputeListHeat(data, listId) {
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return;
  list.heat =
    data.submissions.filter((submission) => submission.listId === listId).length +
    data.candidates
      .filter((candidate) => candidate.listId === listId)
      .reduce((total, candidate) => total + Math.max(1, candidate.supportUserIds.length), 0) +
    data.comments
      .filter((comment) => comment.listId === listId)
      .reduce((total, comment) => total + 1 + comment.likeUserIds.length, 0);
}

function migrateData(data) {
  let changed = false;
  if (!Array.isArray(data.users)) {
    data.users = defaultData().users;
    changed = true;
  }
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
  if (!Array.isArray(data.comments)) {
    data.comments = [];
    changed = true;
  }

  data.rankLists = data.rankLists.map((list) => {
    const normalized = normalizeList(list);
    if (JSON.stringify(normalized) !== JSON.stringify(list)) changed = true;
    return normalized;
  });
  data.candidates = data.candidates.map((candidate) => {
    const normalized = {
      ...candidate,
      id: candidate.id || uuid(),
      kind: candidate.kind || (candidate.imageUrl ? 'image' : 'text'),
      imageUrl: persistImageUrl(candidate.imageUrl || ''),
      supportUserIds: Array.isArray(candidate.supportUserIds) ? candidate.supportUserIds : [],
      status: candidate.status || 'pending',
      createdAt: candidate.createdAt || new Date().toISOString()
    };
    if (JSON.stringify(normalized) !== JSON.stringify(candidate)) changed = true;
    return normalized;
  });
  data.comments = data.comments.map((comment) => ({
    ...comment,
    id: comment.id || uuid(),
    likeUserIds: Array.isArray(comment.likeUserIds) ? comment.likeUserIds : [],
    createdAt: comment.createdAt || new Date().toISOString()
  }));
  return { data, changed };
}

function readRawStore() {
  ensureStore();
  if (storeCache) return storeCache;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const { data, changed } = migrateData(parsed);
  if (changed) writeStore(data);
  storeCache = data;
  return data;
}

function getDueListIds(data, now = Date.now()) {
  return data.rankLists
    .filter((list) => nextHourAfter(list.lastSettledAt).getTime() <= now)
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
    const placements = submissions
      .map((submission) => submission.placements.find((placement) => placement.itemId === item.id))
      .filter(Boolean);
    if (placements.length === 0) return;

    const tierCounts = countBy(placements.map((placement) => Math.max(0, Math.min(tierMax, placement.tierIndex))));
    const [bestTier] = Array.from(tierCounts.entries()).sort((left, right) => {
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

    const lastOrder = Math.max(
      -1,
      ...list.items.filter((item) => item.tierIndex === tierIndex).map((item) => item.order || 0)
    );

    accepted.forEach((candidate, index) => {
      list.items.push({
        id: uuid(),
        name: candidate.name,
        kind: candidate.kind,
        imageUrl: candidate.imageUrl,
        tierIndex,
        order: lastOrder + index + 1
      });
      candidate.status = 'accepted';
      candidate.acceptedAt = nowIso;
    });
  });

  list.tiers.forEach((_, tierIndex) => {
    const tierItems = list.items
      .filter((item) => item.tierIndex === tierIndex)
      .sort((left, right) => (left.order || 0) - (right.order || 0));
    tierItems.forEach((item, index) => {
      item.order = index;
    });
  });

  submissions.forEach((submission) => {
    submission.status = 'settled';
    submission.settledAt = nowIso;
  });
  recomputeListHeat(data, listId);
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
  const pendingCandidateCounts = new Map();
  data.candidates.forEach((candidate) => {
    if (candidate.status !== 'pending') return;
    pendingCandidateCounts.set(candidate.listId, (pendingCandidateCounts.get(candidate.listId) || 0) + 1);
  });

  const commentCounts = new Map();
  data.comments.forEach((comment) => {
    commentCounts.set(comment.listId, (commentCounts.get(comment.listId) || 0) + 1);
  });

  return data.rankLists
    .map((list) => ({
      id: list.id,
      title: list.title,
      description: list.description,
      coverImageUrl: getSummaryCoverImageUrl(list),
      hasCoverImage: Boolean(list.coverImageUrl),
      type: list.type,
      tiers: list.tiers,
      heat: Number(list.heat) || 0,
      lastSettledAt: list.lastSettledAt,
      nextSettlementAt: nextHourAfter(list.lastSettledAt).toISOString(),
      itemCount: list.items.length,
      pendingCandidateCount: pendingCandidateCounts.get(list.id) || 0,
      commentCount: commentCounts.get(list.id) || 0
    }))
    .sort((left, right) => (Number(right.heat) || 0) - (Number(left.heat) || 0));
}

function getListById(id) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === id);
  if (!list) return null;
  return {
    ...list,
    items: [...list.items].sort((left, right) => {
      if (left.tierIndex !== right.tierIndex) return left.tierIndex - right.tierIndex;
      return (left.order || 0) - (right.order || 0);
    })
  };
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
  if (updates.coverImageUrl !== undefined) list.coverImageUrl = persistImageUrl(updates.coverImageUrl);
  writeStore(data);
  return list;
}

function settleListNow(id) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === id);
  if (!list) return null;
  settleList(data, id);
  writeStore(data);
  return getListById(id);
}

function seedMemeStressData(listId, user) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;

  const existingNames = new Set(
    data.candidates.filter((candidate) => candidate.listId === listId).map((candidate) => candidate.name)
  );
  const now = Date.now();
  const added = [];

  STRESS_MEMES.forEach((entry, index) => {
    if (existingNames.has(entry.name)) return;
    const candidateId = uuid();
    const supportCount = Math.max(1, entry.supportCount || 1);
    const supportUserIds = [
      user.id,
      ...Array.from({ length: supportCount - 1 }, (_, supportIndex) => `stress-${candidateId}-${supportIndex}`)
    ];
    const candidate = {
      id: candidateId,
      listId,
      tierIndex: Math.max(0, Math.min(list.tiers.length - 1, entry.tierIndex)),
      name: entry.name,
      kind: 'text',
      imageUrl: '',
      createdBy: user.id,
      createdByName: user.username,
      supportUserIds,
      status: 'pending',
      createdAt: new Date(now - index * 60000).toISOString()
    };
    data.candidates.push(candidate);
    added.push({ ...candidate, supportCount });
  });

  recomputeListHeat(data, listId);
  writeStore(data);
  return { addedCount: added.length, skippedCount: STRESS_MEMES.length - added.length, candidates: added };
}

function normalizeCandidatePayload(list, candidate, user) {
  const rawValue = String(candidate.imageUrl || candidate.name || '').trim();
  const imageUrl = persistImageUrl(candidate.imageUrl || (isImageValue(rawValue) ? rawValue : ''));
  return {
    id: uuid(),
    listId: list.id,
    tierIndex: Math.max(0, Math.min(list.tiers.length - 1, Number(candidate.tierIndex))),
    name: candidate.name || (imageUrl ? '图片选项' : '新选项'),
    kind: imageUrl ? 'image' : 'text',
    imageUrl,
    createdBy: user.id,
    createdByName: user.username,
    supportUserIds: [user.id],
    status: 'pending',
    createdAt: new Date().toISOString()
  };
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
    candidateIds: [],
    supportCandidateIds: [],
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  (payload.supportCandidateIds || []).forEach((candidateId) => {
    const candidate = data.candidates.find(
      (item) => item.id === candidateId && item.listId === listId && item.status === 'pending'
    );
    if (!candidate) return;
    if (!candidate.supportUserIds.includes(user.id)) {
      candidate.supportUserIds.push(user.id);
    }
    submission.supportCandidateIds.push(candidate.id);
  });

  (payload.candidates || []).forEach((candidate) => {
    if (!String(candidate.name || candidate.imageUrl || '').trim()) return;
    const created = normalizeCandidatePayload(list, candidate, user);
    data.candidates.push(created);
    submission.candidateIds.push(created.id);
  });

  data.submissions.push(submission);
  list.heat += 1;
  writeStore(data);
  return submission;
}

function createCandidate(listId, payload, user) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;
  const candidate = normalizeCandidatePayload(list, payload, user);
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

function createComment(listId, content, user) {
  const data = readStore();
  const list = data.rankLists.find((item) => item.id === listId);
  if (!list) return null;
  const comment = {
    id: uuid(),
    listId,
    userId: user.id,
    username: user.username,
    content: String(content || '').trim(),
    likeUserIds: [],
    createdAt: new Date().toISOString()
  };
  data.comments.push(comment);
  list.heat += 1;
  writeStore(data);
  return { ...comment, likeCount: 0 };
}

function likeComment(commentId, user) {
  const data = readStore();
  const comment = data.comments.find((item) => item.id === commentId);
  if (!comment) return null;
  if (!comment.likeUserIds.includes(user.id)) {
    comment.likeUserIds.push(user.id);
    const list = data.rankLists.find((item) => item.id === comment.listId);
    if (list) list.heat += 1;
  }
  writeStore(data);
  return { ...comment, likeCount: comment.likeUserIds.length };
}

function getAdminOverview() {
  const data = readStore();
  const listTitleById = new Map(data.rankLists.map((list) => [list.id, list.title]));
  const lists = data.rankLists
    .map((list) => ({
      id: list.id,
      title: list.title,
      description: list.description,
      heat: list.heat,
      itemCount: list.items.length,
      pendingSubmissionCount: data.submissions.filter(
        (submission) => submission.listId === list.id && submission.status === 'pending'
      ).length,
      candidateCount: data.candidates.filter((candidate) => candidate.listId === list.id).length,
      commentCount: data.comments.filter((comment) => comment.listId === list.id).length,
      lastSettledAt: list.lastSettledAt,
      nextSettlementAt: nextHourAfter(list.lastSettledAt).toISOString()
    }))
    .sort((left, right) => right.heat - left.heat);

  const submissions = data.submissions
    .map((submission) => ({
      id: submission.id,
      listId: submission.listId,
      listTitle: listTitleById.get(submission.listId) || '已删除榜单',
      username: submission.username,
      status: submission.status,
      placementCount: Array.isArray(submission.placements) ? submission.placements.length : 0,
      deleteCount: Array.isArray(submission.deleteItemIds) ? submission.deleteItemIds.length : 0,
      candidateCount: Array.isArray(submission.candidateIds) ? submission.candidateIds.length : 0,
      supportCandidateCount: Array.isArray(submission.supportCandidateIds) ? submission.supportCandidateIds.length : 0,
      createdAt: submission.createdAt,
      settledAt: submission.settledAt || ''
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const candidates = data.candidates
    .map((candidate) => ({
      id: candidate.id,
      listId: candidate.listId,
      listTitle: listTitleById.get(candidate.listId) || '已删除榜单',
      name: candidate.name,
      kind: candidate.kind,
      imageUrl: candidate.imageUrl,
      tierIndex: candidate.tierIndex,
      status: candidate.status,
      supportCount: Array.isArray(candidate.supportUserIds) ? candidate.supportUserIds.length : 0,
      createdByName: candidate.createdByName,
      createdAt: candidate.createdAt
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const comments = data.comments
    .map((comment) => ({
      id: comment.id,
      listId: comment.listId,
      listTitle: listTitleById.get(comment.listId) || '已删除榜单',
      username: comment.username,
      content: comment.content,
      likeCount: Array.isArray(comment.likeUserIds) ? comment.likeUserIds.length : 0,
      createdAt: comment.createdAt
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const users = data.users
    .map((user) => ({
      id: user.id,
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
      submissionCount: data.submissions.filter((submission) => submission.userId === user.id).length,
      candidateCount: data.candidates.filter((candidate) => candidate.createdBy === user.id).length,
      commentCount: data.comments.filter((comment) => comment.userId === user.id).length,
      supportCount: data.candidates.filter(
        (candidate) => Array.isArray(candidate.supportUserIds) && candidate.supportUserIds.includes(user.id)
      ).length,
      likeCount: data.comments.filter(
        (comment) => Array.isArray(comment.likeUserIds) && comment.likeUserIds.includes(user.id)
      ).length
    }))
    .sort((left, right) => {
      if (left.isAdmin !== right.isAdmin) return left.isAdmin ? -1 : 1;
      return left.username.localeCompare(right.username);
    });

  return {
    totals: {
      lists: data.rankLists.length,
      items: data.rankLists.reduce((total, list) => total + list.items.length, 0),
      submissions: data.submissions.length,
      pendingSubmissions: data.submissions.filter((submission) => submission.status === 'pending').length,
      candidates: data.candidates.length,
      pendingCandidates: data.candidates.filter((candidate) => candidate.status === 'pending').length,
      comments: data.comments.length,
      users: data.users.length
    },
    lists,
    submissions,
    candidates,
    comments,
    users
  };
}

function deleteList(id) {
  const data = readStore();
  const exists = data.rankLists.some((list) => list.id === id);
  if (!exists) return false;
  data.rankLists = data.rankLists.filter((list) => list.id !== id);
  data.submissions = data.submissions.filter((submission) => submission.listId !== id);
  data.candidates = data.candidates.filter((candidate) => candidate.listId !== id);
  data.comments = data.comments.filter((comment) => comment.listId !== id);
  writeStore(data);
  return true;
}

function deleteSubmission(id) {
  const data = readStore();
  const submission = data.submissions.find((item) => item.id === id);
  if (!submission) return false;
  data.submissions = data.submissions.filter((item) => item.id !== id);
  recomputeListHeat(data, submission.listId);
  writeStore(data);
  return true;
}

function deleteCandidate(id) {
  const data = readStore();
  const candidate = data.candidates.find((item) => item.id === id);
  if (!candidate) return false;
  data.candidates = data.candidates.filter((item) => item.id !== id);
  data.submissions.forEach((submission) => {
    submission.candidateIds = Array.isArray(submission.candidateIds)
      ? submission.candidateIds.filter((candidateId) => candidateId !== id)
      : [];
    submission.supportCandidateIds = Array.isArray(submission.supportCandidateIds)
      ? submission.supportCandidateIds.filter((candidateId) => candidateId !== id)
      : [];
  });
  recomputeListHeat(data, candidate.listId);
  writeStore(data);
  return true;
}

function deleteComment(id) {
  const data = readStore();
  const comment = data.comments.find((item) => item.id === id);
  if (!comment) return false;
  data.comments = data.comments.filter((item) => item.id !== id);
  recomputeListHeat(data, comment.listId);
  writeStore(data);
  return true;
}

function deleteUser(id, actorId) {
  const data = readStore();
  const user = data.users.find((item) => item.id === id);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.id === actorId) return { ok: false, reason: 'self' };
  if (user.isAdmin && data.users.filter((item) => item.isAdmin).length <= 1) {
    return { ok: false, reason: 'last_admin' };
  }

  const removedCandidateIds = new Set(
    data.candidates.filter((candidate) => candidate.createdBy === id).map((candidate) => candidate.id)
  );

  data.users = data.users.filter((item) => item.id !== id);
  data.submissions = data.submissions
    .filter((submission) => submission.userId !== id)
    .map((submission) => ({
      ...submission,
      candidateIds: Array.isArray(submission.candidateIds)
        ? submission.candidateIds.filter((candidateId) => !removedCandidateIds.has(candidateId))
        : [],
      supportCandidateIds: Array.isArray(submission.supportCandidateIds)
        ? submission.supportCandidateIds.filter((candidateId) => !removedCandidateIds.has(candidateId))
        : []
    }));
  data.candidates = data.candidates
    .filter((candidate) => candidate.createdBy !== id)
    .map((candidate) => ({
      ...candidate,
      supportUserIds: Array.isArray(candidate.supportUserIds)
        ? candidate.supportUserIds.filter((userId) => userId !== id)
        : []
    }));
  data.comments = data.comments
    .filter((comment) => comment.userId !== id)
    .map((comment) => ({
      ...comment,
      likeUserIds: Array.isArray(comment.likeUserIds) ? comment.likeUserIds.filter((userId) => userId !== id) : []
    }));

  data.rankLists.forEach((list) => recomputeListHeat(data, list.id));
  writeStore(data);
  return { ok: true };
}

function setUserAdmin(id, isAdmin, actorId) {
  const data = readStore();
  const user = data.users.find((item) => item.id === id);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.id === actorId) return { ok: false, reason: 'self' };
  if (user.isAdmin && !isAdmin && data.users.filter((item) => item.isAdmin).length <= 1) {
    return { ok: false, reason: 'last_admin' };
  }

  user.isAdmin = Boolean(isAdmin);
  writeStore(data);
  return { ok: true, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } };
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
      id: candidate.id,
      listId: candidate.listId,
      name: candidate.name,
      kind: candidate.kind,
      imageUrl: candidate.imageUrl,
      tierIndex: candidate.tierIndex,
      status: candidate.status,
      createdByName: candidate.createdByName,
      createdAt: candidate.createdAt,
      supportCount: Array.isArray(candidate.supportUserIds) ? candidate.supportUserIds.length : 0
    }));
  const comments = data.comments
    .filter((comment) => comment.listId === listId)
    .map((comment) => ({
      id: comment.id,
      listId: comment.listId,
      username: comment.username,
      content: comment.content,
      createdAt: comment.createdAt,
      likeCount: Array.isArray(comment.likeUserIds) ? comment.likeUserIds.length : 0
    }))
    .sort((left, right) => {
      if (right.likeCount !== left.likeCount) return right.likeCount - left.likeCount;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  return {
    listId,
    nextSettlementAt: nextHourAfter(list.lastSettledAt).toISOString(),
    pendingSubmissionCount: pendingSubmissions.length,
    itemIntent,
    candidates,
    comments
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
  settleListNow,
  seedMemeStressData,
  createSubmission,
  createCandidate,
  supportCandidate,
  createComment,
  likeComment,
  getAdminOverview,
  deleteList,
  deleteSubmission,
  deleteCandidate,
  deleteComment,
  deleteUser,
  setUserAdmin,
  getListSummary
};
