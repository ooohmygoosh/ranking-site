import { useEffect, useMemo, useState } from 'react';

const DEFAULT_TIERS = ['夯', '顶级', '人上人', 'NPC', '拉完了'];

function isImageValue(value) {
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value || '');
}

function clampTier(index, tiers) {
  return Math.max(0, Math.min(tiers.length - 1, Number(index)));
}

function groupItems(items, tiers) {
  return tiers.map((_, tierIndex) =>
    items.filter((item) => clampTier(item.tierIndex, tiers) === tierIndex)
  );
}

function formatTime(value) {
  if (!value) return '下一小时';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function OptionImage({ item }) {
  const isImage = item.kind === 'image' && item.imageUrl;
  return (
    <div className="option-image">
      {isImage ? <img src={item.imageUrl} alt={item.name} /> : <div className="text-card">{item.name}</div>}
    </div>
  );
}

export default function RankingBoard({
  list,
  summary,
  onBack,
  onSubmitRanking,
  onCreateCandidate,
  onSupportCandidate
}) {
  const tiers = list.tiers?.length ? list.tiers : DEFAULT_TIERS;
  const [draftItems, setDraftItems] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [dragItem, setDragItem] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [candidateValue, setCandidateValue] = useState('');

  useEffect(() => {
    setDraftItems((list.items || []).map((item, index) => ({ ...item, originalIndex: index })));
    setDeletedIds([]);
    setDragItem(null);
    setSelectedItem(null);
    setSelectedTier(null);
  }, [list.id, list.items]);

  const itemsByTier = useMemo(() => groupItems(draftItems, tiers), [draftItems, tiers]);
  const selectedTierCandidates = useMemo(() => {
    if (selectedTier === null) return [];
    return (summary?.candidates || [])
      .filter((candidate) => clampTier(candidate.tierIndex, tiers) === selectedTier)
      .sort((left, right) => right.supportCount - left.supportCount);
  }, [selectedTier, summary, tiers]);

  const dirty =
    deletedIds.length > 0 ||
    draftItems.some((item) => {
      const original = (list.items || []).find((entry) => entry.id === item.id);
      return original && clampTier(original.tierIndex, tiers) !== clampTier(item.tierIndex, tiers);
    });

  const moveItemToTier = (itemId, tierIndex) => {
    setDraftItems((items) =>
      items.map((item) => (item.id === itemId ? { ...item, tierIndex } : item))
    );
  };

  const removeItem = (itemId) => {
    setDraftItems((items) => items.filter((item) => item.id !== itemId));
    setDeletedIds((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]));
  };

  const handleDropOnTier = (tierIndex) => (event) => {
    event.preventDefault();
    if (dragItem) moveItemToTier(dragItem.id, tierIndex);
    setDragItem(null);
    setDragOverTier(null);
  };

  const submitRanking = () => {
    onSubmitRanking({
      placements: draftItems.map((item) => ({ itemId: item.id, tierIndex: clampTier(item.tierIndex, tiers) })),
      deleteItemIds: deletedIds
    });
  };

  const submitCandidate = (event) => {
    event.preventDefault();
    const value = candidateValue.trim();
    if (selectedTier === null || !value) return;
    onCreateCandidate({
      tierIndex: selectedTier,
      name: isImageValue(value) ? '图片选项' : value,
      imageUrl: isImageValue(value) ? value : ''
    });
    setCandidateValue('');
  };

  const itemIntent = selectedItem ? summary?.itemIntent?.[selectedItem.id] : null;

  return (
    <div className="ranking-page">
      <div className="ranking-header">
        <button className="btn secondary" type="button" onClick={onBack}>
          返回榜单
        </button>
        <div>
          <h1>{list.title}</h1>
          <p>{list.description}</p>
        </div>
        <div className="settlement-card">
          <span>下次更新</span>
          <strong>{formatTime(summary?.nextSettlementAt)}</strong>
        </div>
      </div>

      <div className="board-actions">
        <span>{summary?.pendingSubmissionCount || 0} 份待结算排序意愿</span>
        <button className="btn primary" type="button" disabled={!dirty} onClick={submitRanking}>
          提交本次排序
        </button>
      </div>

      <div className="board-wrap">
        <div className="tier-list">
          {tiers.map((tier, tierIndex) => (
            <section
              key={tier}
              className={`tier-row tier-${tierIndex}${dragOverTier === tierIndex ? ' is-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTier(tierIndex);
              }}
              onDragLeave={() => setDragOverTier(null)}
              onDrop={handleDropOnTier(tierIndex)}
            >
              <button className="tier-label" type="button" onClick={() => setSelectedTier(tierIndex)}>
                {tier}
              </button>
              <div className="tier-options">
                {itemsByTier[tierIndex].map((item) => (
                  <button
                    key={item.id}
                    className="option-tile"
                    draggable
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    onDragStart={() => setDragItem(item)}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDragOverTier(null);
                    }}
                  >
                    <OptionImage item={item} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {dragItem ? (
          <div
            className="delete-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              removeItem(dragItem.id);
              setDragItem(null);
            }}
          >
            拖到这里删除
          </div>
        ) : null}
      </div>

      {selectedItem ? (
        <aside className="detail-drawer">
          <div className="drawer-header">
            <strong>{selectedItem.name}</strong>
            <button className="icon-btn" type="button" onClick={() => setSelectedItem(null)}>
              ×
            </button>
          </div>
          <OptionImage item={selectedItem} />
          <div className="intent-list">
            {tiers.map((tier, index) => (
              <div key={tier} className="intent-row">
                <span>{tier}</span>
                <strong>{itemIntent?.targetCounts?.[index] || 0}</strong>
              </div>
            ))}
            <div className="intent-row danger">
              <span>希望删除</span>
              <strong>{itemIntent?.deleteCount || 0}</strong>
            </div>
          </div>
        </aside>
      ) : null}

      {selectedTier !== null ? (
        <aside className="detail-drawer wide">
          <div className="drawer-header">
            <strong>想加入「{tiers[selectedTier]}」的候选</strong>
            <button className="icon-btn" type="button" onClick={() => setSelectedTier(null)}>
              ×
            </button>
          </div>
          <div className="candidate-list">
            {selectedTierCandidates.length === 0 ? (
              <p className="empty-state">暂无候选</p>
            ) : (
              selectedTierCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  className="candidate-card"
                  type="button"
                  onClick={() => onSupportCandidate(candidate.id)}
                >
                  <OptionImage item={candidate} />
                  <span>{candidate.name}</span>
                  <strong>热度 {candidate.supportCount}</strong>
                </button>
              ))
            )}
          </div>
          <form className="candidate-form" onSubmit={submitCandidate}>
            <input
              value={candidateValue}
              onChange={(event) => setCandidateValue(event.target.value)}
              placeholder="输入文字，或粘贴图片 URL"
            />
            <button className="btn primary" type="submit">
              上传候选
            </button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}
