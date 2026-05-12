import { useEffect, useMemo, useRef, useState } from 'react';
import RankingBoard from './components/RankingBoard';
import {
  loginApi,
  registerApi,
  getUserApi,
  getListsApi,
  getListApi,
  getListSummaryApi,
  createListApi,
  submitRankingApi,
  createCommentApi,
  likeCommentApi,
  getAdminOverviewApi,
  createCandidateApi,
  deleteAdminListApi,
  deleteAdminSubmissionApi,
  deleteAdminCandidateApi,
  deleteAdminCommentApi,
  deleteAdminUserApi,
  updateAdminUserRoleApi,
  settleAdminListApi
} from './services/api';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function imageFileToOptimizedDataUrl(file, maxSize = 900, quality = 0.82) {
  const dataUrl = await fileToDataUrl(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function cropImageToAspect(dataUrl, aspect = 16 / 9, zoom = 1, offset = { x: 0, y: 0 }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      let cropWidth = image.width / zoom;
      let cropHeight = cropWidth / aspect;
      if (cropHeight > image.height / zoom) {
        cropHeight = image.height / zoom;
        cropWidth = cropHeight * aspect;
      }

      const maxX = Math.max(1, (image.width - cropWidth) / 2);
      const maxY = Math.max(1, (image.height - cropHeight) / 2);
      const sx = Math.max(0, Math.min(image.width - cropWidth, (image.width - cropWidth) / 2 - offset.x * maxX));
      const sy = Math.max(0, Math.min(image.height - cropHeight, (image.height - cropHeight) / 2 - offset.y * maxY));
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      canvas.getContext('2d').drawImage(image, sx, sy, cropWidth, cropHeight, 0, 0, 640, 360);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function makeAccount() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    username: `user_${suffix}`,
    password: `pw_${Math.random().toString(36).slice(2, 10)}`
  };
}

function readSavedAccount() {
  try {
    return JSON.parse(localStorage.getItem('savedRankingAccount') || 'null');
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function App() {
  const savedAccount = readSavedAccount();
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [user, setUser] = useState(null);
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [summary, setSummary] = useState(null);
  const [comments, setComments] = useState([]);
  const [adminMode, setAdminMode] = useState(false);
  const [adminData, setAdminData] = useState(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [bootLoading, setBootLoading] = useState(Boolean(token));
  const [homeLoading, setHomeLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCoverImageUrl, setNewCoverImageUrl] = useState('');
  const [coverCropDraft, setCoverCropDraft] = useState(null);
  const [coverCropZoom, setCoverCropZoom] = useState(1);
  const [coverCropOffset, setCoverCropOffset] = useState({ x: 0, y: 0 });
  const [coverCropDrag, setCoverCropDrag] = useState(null);
  const [generatedAccount, setGeneratedAccount] = useState(savedAccount || makeAccount());
  const creatingListRef = useRef(false);
  const coverInputRef = useRef(null);
  const pendingRankingRef = useRef({ dirty: false, payload: null });

  async function loadHome() {
    setHomeLoading(true);
    try {
      const data = await getListsApi();
      setLists(data);
      return data;
    } finally {
      setHomeLoading(false);
    }
  }

  async function loadDetail(listId) {
    setDetailLoading(true);
    try {
      const [listData, summaryData] = await Promise.all([getListApi(listId), getListSummaryApi(listId)]);
      setActiveList(listData);
      setSummary(summaryData);
      setComments(summaryData.comments || []);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadAdmin() {
    setAdminData(await getAdminOverviewApi());
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!token) {
        localStorage.removeItem('authToken');
        setUser(null);
        setBootLoading(false);
        setHomeLoading(false);
        return;
      }
      setBootLoading(true);
      setHomeLoading(true);
      try {
        localStorage.setItem('authToken', token);
        const homeRequest = getListsApi().catch((err) => ({ error: err }));
        const userData = await getUserApi();
        if (cancelled) return;
        setUser(userData);
        const homeResult = await homeRequest;
        if (cancelled) return;
        if (homeResult.error) {
          setMessage(homeResult.error.message || '榜单加载失败');
        } else {
          setLists(homeResult);
        }
      } catch (err) {
        localStorage.removeItem('authToken');
        setToken('');
        setMessage(err.message || '加载失败');
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          setHomeLoading(false);
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!adminMode || !user?.isAdmin) return;
    loadAdmin().catch((err) => setMessage(err.message || '后台加载失败'));
  }, [adminMode, user?.isAdmin]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 5600);
    return () => window.clearTimeout(timer);
  }, [message]);

  const filteredLists = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return [...lists]
      .filter((list) => {
        if (!keyword) return true;
        return `${list.title} ${list.description || ''}`.toLowerCase().includes(keyword);
      })
      .sort((left, right) => (Number(right.heat) || 0) - (Number(left.heat) || 0));
  }, [lists, query]);

  const handleLogin = async (username, password) => {
    try {
      const result = await loginApi(username, password);
      localStorage.setItem('savedRankingAccount', JSON.stringify({ username, password }));
      setToken(result.token);
      setMessage('');
    } catch (err) {
      setMessage(err.message || '登录失败');
    }
  };

  const handleRegisterDefault = async () => {
    try {
      const result = await registerApi(generatedAccount.username, generatedAccount.password);
      localStorage.setItem('savedRankingAccount', JSON.stringify(generatedAccount));
      setToken(result.token);
      setMessage('');
    } catch (err) {
      const retry = makeAccount();
      setGeneratedAccount(retry);
      setMessage(err.message || '注册失败，已重新生成账号');
    }
  };

  const clearSession = () => {
    pendingRankingRef.current = { dirty: false, payload: null };
    setToken('');
    localStorage.removeItem('authToken');
    setUser(null);
    setActiveList(null);
    setSummary(null);
    setComments([]);
    setAdminMode(false);
  };

  const handleLogout = async () => {
    const pendingRanking = pendingRankingRef.current;
    if (activeList && pendingRanking?.dirty && pendingRanking.payload) {
      try {
        await submitRankingApi(activeList.id, pendingRanking.payload);
      } catch (err) {
        setMessage(err.message || '退出前自动提交失败');
        return;
      }
    }
    clearSession();
  };

  const handleOpenList = async (listId) => {
    try {
      pendingRankingRef.current = { dirty: false, payload: null };
      setAdminMode(false);
      setActiveList(null);
      setSummary(null);
      setComments([]);
      await loadDetail(listId);
    } catch (err) {
      setMessage(err.message || '打开榜单失败');
    }
  };

  const handleSubmitRanking = async (payload) => {
    if (!activeList) return;
    try {
      await submitRankingApi(activeList.id, payload);
      setMessage('已提交，本轮排序、删除、候选和支持会在下个整点结算时生效');
      await loadDetail(activeList.id);
      await loadHome();
    } catch (err) {
      setMessage(err.message || '提交失败');
    }
  };

  const handlePendingRankingChange = (snapshot) => {
    pendingRankingRef.current = snapshot || { dirty: false, payload: null };
  };

  const handleCreateCandidate = async (payload) => {
    if (!activeList) return null;
    const candidate = await createCandidateApi(activeList.id, payload);
    await loadDetail(activeList.id);
    await loadHome();
    if (adminMode && user?.isAdmin) await loadAdmin();
    return candidate;
  };

  const handleCreateComment = async (content) => {
    if (!activeList) return;
    try {
      const comment = await createCommentApi(activeList.id, content);
      setComments((items) => [comment, ...items]);
      await loadHome();
    } catch (err) {
      setMessage(err.message || '评论失败');
    }
  };

  const handleLikeComment = async (commentId) => {
    try {
      const comment = await likeCommentApi(commentId);
      setComments((items) => items.map((item) => (item.id === comment.id ? comment : item)));
      await loadHome();
    } catch (err) {
      setMessage(err.message || '点赞失败');
    }
  };

  const handleAdminDelete = async (kind, id) => {
    const names = { list: '榜单', submission: '排序意愿', candidate: '候选', comment: '评论', user: '账户' };
    if (!window.confirm(`确认删除这个${names[kind]}？`)) return;
    try {
      if (kind === 'list') await deleteAdminListApi(id);
      if (kind === 'submission') await deleteAdminSubmissionApi(id);
      if (kind === 'candidate') await deleteAdminCandidateApi(id);
      if (kind === 'comment') await deleteAdminCommentApi(id);
      if (kind === 'user') await deleteAdminUserApi(id);
      setMessage(`已删除${names[kind]}`);
      await loadAdmin();
      await loadHome();
      if (activeList && kind === 'list' && activeList.id === id) setActiveList(null);
      if (activeList && kind !== 'list') await loadDetail(activeList.id);
    } catch (err) {
      setMessage(err.message || '删除失败');
    }
  };

  const handleAdminRoleChange = async (userId, isAdmin) => {
    try {
      await updateAdminUserRoleApi(userId, isAdmin);
      setMessage(isAdmin ? '已设为管理员' : '已设为普通用户');
      await loadAdmin();
    } catch (err) {
      setMessage(err.message || '权限修改失败');
    }
  };

  const handleAdminSettleList = async (listId) => {
    try {
      await settleAdminListApi(listId);
      setMessage('已按当前热度立即推送');
      await loadAdmin();
      await loadHome();
      if (activeList?.id === listId) await loadDetail(listId);
    } catch (err) {
      setMessage(err.message || '立即推送失败');
    }
  };

  const handleCoverFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCoverCropZoom(1);
    setCoverCropOffset({ x: 0, y: 0 });
    setCoverCropDraft(await fileToDataUrl(file));
  };

  const confirmCoverCrop = async () => {
    if (!coverCropDraft) return;
    setNewCoverImageUrl(await cropImageToAspect(coverCropDraft, 16 / 9, coverCropZoom, coverCropOffset));
    setCoverCropDraft(null);
  };

  const handleCreateList = async (event) => {
    event.preventDefault();
    if (!newTitle.trim() || creatingListRef.current) return;
    creatingListRef.current = true;
    setIsCreatingList(true);
    try {
      const list = await createListApi({
        title: newTitle.trim(),
        description: newDescription.trim() || '大家一起排序，每个整点根据意愿更新一次。',
        coverImageUrl: newCoverImageUrl,
        items: []
      });
      setCreating(false);
      setNewTitle('');
      setNewDescription('');
      setNewCoverImageUrl('');
      await loadHome();
      await loadDetail(list.id);
      creatingListRef.current = false;
      setIsCreatingList(false);
    } catch (err) {
      creatingListRef.current = false;
      setIsCreatingList(false);
      setMessage(err.message || '创建失败');
    }
  };

  if (bootLoading && token && !user) {
    return <LoadingScreen />;
  }

  if (!token || !user) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>从夯到拉</h1>
          <QuickStart
            account={generatedAccount}
            setAccount={setGeneratedAccount}
            onStart={handleRegisterDefault}
            onLogin={handleLogin}
            message={message}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand-block"
          type="button"
          onClick={() => {
            setActiveList(null);
            setAdminMode(false);
          }}
        >
          <span className="brand-mark">夯</span>
          <span>从夯到拉</span>
        </button>
        <div className="account-block">
          <span>@{user.username}</span>
          {user.isAdmin ? (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setActiveList(null);
                setAdminMode((value) => !value);
              }}
            >
              {adminMode ? '前台' : '后台'}
            </button>
          ) : null}
          <button className="btn secondary" onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>

      {adminMode ? (
        <AdminPanel
          data={adminData}
          onRefresh={loadAdmin}
          onDelete={handleAdminDelete}
          onToggleUserRole={handleAdminRoleChange}
          onSettleList={handleAdminSettleList}
        />
      ) : detailLoading && !activeList ? (
        <main className="detail-page">
          <DetailSkeleton />
        </main>
      ) : !activeList ? (
        <main className="home-page">
          <section className="home-intro">
            <h1>大家一起排，系统每个整点更新</h1>
            <p>选择一个榜单，拖动图片卡到你认为合适的档位，最后一次性提交排序和候选意愿。</p>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索榜单" />
          </section>
          <section className="list-grid">
            <button className="list-card create-list-card" type="button" onClick={() => setCreating(true)}>
              <div className="list-cover create-cover">
                <span>+</span>
              </div>
              <div className="list-card-body">
                <h2>新建表单</h2>
                <p>创建一个新的从夯到拉榜单，设置名字和封面图。</p>
              </div>
            </button>

            {homeLoading && lists.length === 0 ? <HomeSkeleton /> : null}
            {!homeLoading || lists.length > 0 ? filteredLists.map((list) => (
              <button key={list.id} className="list-card" type="button" onClick={() => handleOpenList(list.id)}>
                <div className="list-cover">
                  {list.coverImageUrl ? (
                    <img src={list.coverImageUrl} alt={list.title} loading="lazy" decoding="async" />
                  ) : (
                    <span>{list.title}</span>
                  )}
                </div>
                <div className="list-card-body">
                  <h2>{list.title}</h2>
                  <p>{list.description}</p>
                  <div className="list-meta">
                    <span>热度 {list.heat}</span>
                  </div>
                </div>
              </button>
            )) : null}
          </section>
        </main>
      ) : (
        <main className="detail-page">
          <RankingBoard
            list={activeList}
            summary={summary}
            comments={comments}
            onBack={() => setActiveList(null)}
            onSubmitRanking={handleSubmitRanking}
            onPendingChange={handlePendingRankingChange}
            onCreateCandidate={handleCreateCandidate}
            onCreateComment={handleCreateComment}
            onLikeComment={handleLikeComment}
          />
        </main>
      )}

      {creating ? (
        <div className="create-modal">
          <form className="create-box" onSubmit={handleCreateList}>
            <div className="drawer-header">
              <strong>新建榜单</strong>
              <button className="icon-btn" type="button" onClick={() => setCreating(false)}>
                x
              </button>
            </div>
            <label>
              榜单名字
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required placeholder="例如：年度角色榜" />
            </label>
            <label>
              简介
              <input
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="一句话说明这个榜单"
              />
            </label>
            <label>
              封面图片 URL
              <input
                value={newCoverImageUrl}
                onChange={(event) => setNewCoverImageUrl(event.target.value)}
                placeholder="可粘贴图片 URL，也可拖入或选择本地图片"
              />
            </label>
            <div
              className="image-drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleCoverFile(event.dataTransfer.files?.[0]);
              }}
              onClick={() => coverInputRef.current?.click()}
            >
              {newCoverImageUrl ? <img src={newCoverImageUrl} alt="榜单封面预览" /> : '拖入封面图，或点击选择图片'}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => handleCoverFile(event.target.files?.[0])}
              />
            </div>
            <button className="btn primary" type="submit" disabled={isCreatingList || !newTitle.trim()}>
              创建并进入
            </button>
          </form>
        </div>
      ) : null}

      {coverCropDraft ? (
        <div className="crop-modal">
          <div className="crop-box">
            <div className="drawer-header">
              <strong>裁剪榜单封面</strong>
              <button className="icon-btn" type="button" onClick={() => setCoverCropDraft(null)}>
                x
              </button>
            </div>
            <div
              className="crop-preview cover-crop-preview"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setCoverCropDrag({ x: event.clientX, y: event.clientY, offset: coverCropOffset });
              }}
              onPointerMove={(event) => {
                if (!coverCropDrag) return;
                const nextX = coverCropDrag.offset.x + (event.clientX - coverCropDrag.x) / 140;
                const nextY = coverCropDrag.offset.y + (event.clientY - coverCropDrag.y) / 140;
                setCoverCropOffset({
                  x: Math.max(-1, Math.min(1, nextX)),
                  y: Math.max(-1, Math.min(1, nextY))
                });
              }}
              onPointerUp={() => setCoverCropDrag(null)}
              onPointerCancel={() => setCoverCropDrag(null)}
            >
              <img
                src={coverCropDraft}
                alt="待裁剪封面"
                style={{
                  transform: `translate(${coverCropOffset.x * 38}px, ${coverCropOffset.y * 38}px) scale(${coverCropZoom})`
                }}
              />
            </div>
            <label className="crop-slider">
              缩放
              <input
                type="range"
                min="1"
                max="2.5"
                step="0.05"
                value={coverCropZoom}
                onChange={(event) => setCoverCropZoom(Number(event.target.value))}
              />
            </label>
            <button className="btn primary" type="button" onClick={confirmCoverCrop}>
              使用这张封面
            </button>
          </div>
        </div>
      ) : null}

      {message ? <div className="page-message">{message}</div> : null}
    </div>
  );
}

function LoadingMark({ label = '加载中' }) {
  return (
    <div className="loading-mark" role="status" aria-live="polite">
      <span className="loading-logo">夯</span>
      <span className="loading-ring" />
      <strong>{label}</strong>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <LoadingMark label="正在进入榜单" />
      <div className="loading-skeleton-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="list-card skeleton-card" aria-hidden="true">
      <div className="list-cover skeleton-block" />
      <div className="list-card-body">
        <span className="skeleton-line strong" />
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </>
  );
}

function DetailSkeleton() {
  return (
    <section className="detail-skeleton" aria-live="polite">
      <LoadingMark label="正在读取榜单" />
      {[0, 1, 2, 3, 4].map((index) => (
        <div className="tier-row skeleton-tier" key={index}>
          <div className="tier-label skeleton-label" />
          <div className="tier-options">
            <span className="option-tile skeleton-tile" />
            <span className="option-tile skeleton-tile" />
            <span className="option-tile skeleton-tile" />
          </div>
        </div>
      ))}
    </section>
  );
}

function QuickStart({ account, setAccount, onStart, onLogin, message }) {
  const [mode, setMode] = useState('register');
  const [loginName, setLoginName] = useState(account.username || '');
  const [loginPassword, setLoginPassword] = useState(account.password || '');

  const submitLogin = (event) => {
    event.preventDefault();
    onLogin(loginName, loginPassword);
  };

  return (
    <div className="quick-start">
      <div className="auth-tabs">
        <button className={mode === 'register' ? 'is-active' : ''} type="button" onClick={() => setMode('register')}>
          注册
        </button>
        <button className={mode === 'login' ? 'is-active' : ''} type="button" onClick={() => setMode('login')}>
          登录
        </button>
      </div>

      {mode === 'register' ? (
        <div className="generated-account">
          <label>
            用户名
            <input
              value={account.username}
              onChange={(event) => setAccount((current) => ({ ...current, username: event.target.value }))}
            />
          </label>
          <label>
            密码
            <input
              value={account.password}
              onChange={(event) => setAccount((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <button className="btn primary" type="button" onClick={onStart}>
            注册
          </button>
        </div>
      ) : (
        <form className="login-form" onSubmit={submitLogin}>
          <label>
            <span>账号</span>
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} required placeholder="输入账号" />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
              placeholder="输入密码"
            />
          </label>
          <button className="btn primary" type="submit">
            登录
          </button>
        </form>
      )}
      {message ? <div className="form-error">{message}</div> : null}
    </div>
  );
}

function AdminPanel({ data, onRefresh, onDelete, onToggleUserRole, onSettleList }) {
  const [tab, setTab] = useState('lists');

  if (!data) {
    return (
      <main className="admin-page">
        <section className="admin-hero">
          <h1>后台</h1>
          <p>正在读取网站数据。</p>
        </section>
      </main>
    );
  }

  const tabs = [
    { id: 'lists', label: '榜单', count: data.lists.length },
    { id: 'submissions', label: '排序意愿', count: data.submissions.length },
    { id: 'candidates', label: '候选', count: data.candidates.length },
    { id: 'comments', label: '评论', count: data.comments.length },
    { id: 'users', label: '账户', count: data.users.length }
  ];

  return (
    <main className="admin-page">
      <section className="admin-hero">
        <div>
          <h1>后台</h1>
          <p>可视化查看网站数据，并删除榜单、评论、候选和待结算排序意愿。</p>
        </div>
        <button className="btn secondary" type="button" onClick={onRefresh}>
          刷新
        </button>
      </section>

      <section className="admin-stats">
        <Stat label="榜单" value={data.totals.lists} />
        <Stat label="选项" value={data.totals.items} />
        <Stat label="待结算意愿" value={data.totals.pendingSubmissions} />
        <Stat label="候选" value={data.totals.candidates} />
        <Stat label="评论" value={data.totals.comments} />
        <Stat label="用户" value={data.totals.users} />
      </section>

      <nav className="admin-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label} {item.count}
          </button>
        ))}
      </nav>

      {tab === 'lists' ? (
        <ListTable
          rows={data.lists}
          onDelete={(id) => onDelete('list', id)}
          onSettle={onSettleList}
        />
      ) : null}
      {tab === 'submissions' ? (
        <SubmissionTable rows={data.submissions} onDelete={(id) => onDelete('submission', id)} />
      ) : null}
      {tab === 'candidates' ? <CandidateTable rows={data.candidates} onDelete={(id) => onDelete('candidate', id)} /> : null}
      {tab === 'comments' ? <CommentTable rows={data.comments} onDelete={(id) => onDelete('comment', id)} /> : null}
      {tab === 'users' ? (
        <UserTable rows={data.users} onDelete={(id) => onDelete('user', id)} onToggleRole={onToggleUserRole} />
      ) : null}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ListTable({ rows, onDelete, onSettle }) {
  return (
    <section className="admin-table">
      <div className="admin-table-head list-cols">
        <span>榜单</span>
        <span>热度</span>
        <span>数据</span>
        <span>下次更新</span>
        <span>操作</span>
      </div>
      {rows.map((row) => (
        <div className="admin-table-row list-cols" key={row.id}>
          <div>
            <strong>{row.title}</strong>
            <p>{row.description}</p>
          </div>
          <span>{row.heat}</span>
          <span>
            {row.itemCount} 项 · {row.pendingSubmissionCount} 意愿 · {row.candidateCount} 候选 · {row.commentCount} 评论
          </span>
          <span>{formatDate(row.nextSettlementAt)}</span>
          <div className="admin-actions">
            <button className="btn primary" type="button" onClick={() => onSettle(row.id)}>
              立即推送
            </button>
            <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
              删除
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function SubmissionTable({ rows, onDelete }) {
  return (
    <section className="admin-table">
      <div className="admin-table-head submission-cols">
        <span>榜单 / 用户</span>
        <span>状态</span>
        <span>内容</span>
        <span>时间</span>
        <span>操作</span>
      </div>
      {rows.map((row) => (
        <div className="admin-table-row submission-cols" key={row.id}>
          <div>
            <strong>{row.listTitle}</strong>
            <p>@{row.username}</p>
          </div>
          <span>{row.status === 'pending' ? '待结算' : '已结算'}</span>
          <span>
            {row.placementCount} 排序 · {row.deleteCount} 删除 · {row.candidateCount} 新候选 ·{' '}
            {row.supportCandidateCount} 支持
          </span>
          <span>{formatDate(row.createdAt)}</span>
          <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
            删除
          </button>
        </div>
      ))}
    </section>
  );
}

function CandidateTable({ rows, onDelete }) {
  const maxSupport = Math.max(1, ...rows.map((row) => row.supportCount || 0));
  return (
    <section className="admin-table">
      <div className="admin-table-head candidate-cols">
        <span>候选</span>
        <span>榜单</span>
        <span>热度</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      {rows.map((row) => (
        <div className="admin-table-row candidate-cols" key={row.id}>
          <div className="admin-candidate-cell">
            {row.imageUrl ? <img src={row.imageUrl} alt={row.name} /> : <span>{row.name}</span>}
            <div>
              <strong>{row.name}</strong>
              <p>@{row.createdByName} · 档位 {row.tierIndex + 1}</p>
            </div>
          </div>
          <span>{row.listTitle}</span>
          <div className="admin-heat-cell">
            <strong>{row.supportCount}</strong>
            <div className="heat-bar" aria-label={`${row.name} ${Math.round(((row.supportCount || 0) / maxSupport) * 100)}%`}>
              <span style={{ width: `${Math.round(((row.supportCount || 0) / maxSupport) * 100)}%` }} />
            </div>
          </div>
          <span>{row.status === 'pending' ? '待加入' : '已处理'}</span>
          <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
            删除
          </button>
        </div>
      ))}
    </section>
  );
}

function CommentTable({ rows, onDelete }) {
  return (
    <section className="admin-table">
      <div className="admin-table-head comment-cols">
        <span>评论</span>
        <span>榜单</span>
        <span>点赞</span>
        <span>时间</span>
        <span>操作</span>
      </div>
      {rows.map((row) => (
        <div className="admin-table-row comment-cols" key={row.id}>
          <div>
            <strong>@{row.username}</strong>
            <p>{row.content}</p>
          </div>
          <span>{row.listTitle}</span>
          <span>{row.likeCount}</span>
          <span>{formatDate(row.createdAt)}</span>
          <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
            删除
          </button>
        </div>
      ))}
    </section>
  );
}

function UserTable({ rows, onDelete, onToggleRole }) {
  return (
    <section className="admin-table">
      <div className="admin-table-head user-cols">
        <span>账户</span>
        <span>权限</span>
        <span>内容</span>
        <span>互动</span>
        <span>操作</span>
      </div>
      {rows.map((row) => (
        <div className="admin-table-row user-cols" key={row.id}>
          <div>
            <strong>@{row.username}</strong>
            <p>{row.id}</p>
          </div>
          <span>{row.isAdmin ? '管理员' : '用户'}</span>
          <span>
            {row.submissionCount} 意愿 · {row.candidateCount} 候选 · {row.commentCount} 评论
          </span>
          <span>
            {row.supportCount} 支持 · {row.likeCount} 点赞
          </span>
          <div className="admin-actions">
            <button className="btn secondary" type="button" onClick={() => onToggleRole(row.id, !row.isAdmin)}>
              {row.isAdmin ? '设为用户' : '设为管理员'}
            </button>
            <button className="btn danger" type="button" onClick={() => onDelete(row.id)}>
              删除
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export default App;
