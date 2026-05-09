import { useEffect, useMemo, useState } from 'react';
import RankingBoard from './components/RankingBoard';
import {
  loginApi,
  registerApi,
  getUserApi,
  getListsApi,
  getListApi,
  getListSummaryApi,
  submitRankingApi,
  createCandidateApi,
  supportCandidateApi
} from './services/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [user, setUser] = useState(null);
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  async function loadHome() {
    const listData = await getListsApi();
    setLists(listData);
  }

  async function loadDetail(listId) {
    const [listData, summaryData] = await Promise.all([
      getListApi(listId),
      getListSummaryApi(listId)
    ]);
    setActiveList(listData);
    setSummary(summaryData);
  }

  useEffect(() => {
    async function boot() {
      if (!token) {
        localStorage.removeItem('authToken');
        setUser(null);
        return;
      }
      try {
        localStorage.setItem('authToken', token);
        const userData = await getUserApi();
        setUser(userData);
        await loadHome();
      } catch (err) {
        setMessage(err.message || '加载失败');
      }
    }
    boot();
  }, [token]);

  const filteredLists = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return lists
      .filter((list) => {
        if (!keyword) return true;
        return `${list.title} ${list.description || ''}`.toLowerCase().includes(keyword);
      })
      .sort((left, right) => right.heat - left.heat);
  }, [lists, query]);

  const handleLogin = async (username, password, isRegister) => {
    try {
      const result = isRegister
        ? await registerApi(username, password)
        : await loginApi(username, password);
      setToken(result.token);
      setMessage('');
    } catch (err) {
      setMessage(err.message || '登录失败');
    }
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setActiveList(null);
    setSummary(null);
  };

  const handleOpenList = async (listId) => {
    try {
      await loadDetail(listId);
    } catch (err) {
      setMessage(err.message || '打开榜单失败');
    }
  };

  const handleSubmitRanking = async (payload) => {
    if (!activeList) return;
    try {
      await submitRankingApi(activeList.id, payload);
      setMessage('已提交，本轮意愿会在下次整点结算时生效');
      await loadDetail(activeList.id);
      await loadHome();
    } catch (err) {
      setMessage(err.message || '提交失败');
    }
  };

  const handleCreateCandidate = async (payload) => {
    if (!activeList) return;
    try {
      await createCandidateApi(activeList.id, payload);
      setMessage('已加入候选池');
      await loadDetail(activeList.id);
      await loadHome();
    } catch (err) {
      setMessage(err.message || '新增候选失败');
    }
  };

  const handleSupportCandidate = async (candidateId) => {
    try {
      await supportCandidateApi(candidateId);
      setMessage('已支持该候选');
      if (activeList) await loadDetail(activeList.id);
      await loadHome();
    } catch (err) {
      setMessage(err.message || '支持失败');
    }
  };

  if (!token || !user) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>从夯到拉</h1>
          <LoginForm onSubmit={handleLogin} message={message} />
          <div className="login-note">演示账号: admin / admin123</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-block" type="button" onClick={() => setActiveList(null)}>
          <span className="brand-mark">夯</span>
          <span>从夯到拉</span>
        </button>
        <div className="account-block">
          <span>@{user.username}</span>
          <button className="btn secondary" onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>

      {!activeList ? (
        <main className="home-page">
          <section className="home-intro">
            <h1>大家一起排，系统每小时更新</h1>
            <p>选择一个榜单，拖动图片卡到你认为合适的档位，提交后等待下次结算。</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索榜单"
            />
          </section>
          <section className="list-grid">
            {filteredLists.map((list) => (
              <button key={list.id} className="list-card" type="button" onClick={() => handleOpenList(list.id)}>
                <div className="list-cover">
                  {list.coverImageUrl ? <img src={list.coverImageUrl} alt={list.title} /> : <span>{list.title}</span>}
                </div>
                <div className="list-card-body">
                  <h2>{list.title}</h2>
                  <p>{list.description}</p>
                  <div className="list-meta">
                    <span>热度 {list.heat}</span>
                    <span>{list.itemCount} 个选项</span>
                    <span>{list.pendingCandidateCount} 个候选</span>
                  </div>
                </div>
              </button>
            ))}
          </section>
        </main>
      ) : (
        <main className="detail-page">
          <RankingBoard
            list={activeList}
            summary={summary}
            onBack={() => setActiveList(null)}
            onSubmitRanking={handleSubmitRanking}
            onCreateCandidate={handleCreateCandidate}
            onSupportCandidate={handleSupportCandidate}
          />
        </main>
      )}

      {message ? <div className="page-message">{message}</div> : null}
    </div>
  );
}

function LoginForm({ onSubmit, message }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registerMode, setRegisterMode] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    onSubmit(username, password, registerMode);
  };

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        <span>账号</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          placeholder="输入账号"
        />
      </label>
      <label>
        <span>密码</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          placeholder="输入密码"
        />
      </label>
      <div className="login-actions">
        <button className="btn primary" type="submit">
          {registerMode ? '注册' : '登录'}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => setRegisterMode((mode) => !mode)}
        >
          {registerMode ? '返回登录' : '新用户'}
        </button>
      </div>
      {message ? <div className="form-error">{message}</div> : null}
    </form>
  );
}

export default App;
