import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_TIERS = ['夯', '顶级', '人上人', 'NPC', '拉完了'];

function isImageValue(value) {
  return /^(https?:\/\/.+\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?|data:image\/[^;]+;base64,.+)$/i.test(
    value || ''
  );
}

function clampTier(index, tiers) {
  return Math.max(0, Math.min(tiers.length - 1, Number(index)));
}

function groupItems(items, tiers) {
  return tiers.map((_, tierIndex) =>
    items
      .filter((item) => clampTier(item.tierIndex, tiers) === tierIndex)
      .sort((left, right) => (left.localOrder ?? left.order ?? 0) - (right.localOrder ?? right.order ?? 0))
  );
}

function formatTime(value) {
  if (!value) return '下个整点';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cropSquare(dataUrl, zoom = 1, offset = { x: 0, y: 0 }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = Math.min(image.width, image.height) / zoom;
      const maxX = Math.max(1, (image.width - size) / 2);
      const maxY = Math.max(1, (image.height - size) / 2);
      const sx = Math.max(0, Math.min(image.width - size, (image.width - size) / 2 - offset.x * maxX));
      const sy = Math.max(0, Math.min(image.height - size, (image.height - size) / 2 - offset.y * maxY));
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 384;
      canvas.getContext('2d').drawImage(image, sx, sy, size, size, 0, 0, 384, 384);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function OptionImage({ item }) {
  const isImage = item.kind === 'image' && item.imageUrl;
  return (
    <div className="option-image">
      {isImage ? (
        <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
      ) : (
        <div className="text-card">{item.name}</div>
      )}
    </div>
  );
}

function collectPageCss() {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules || [])
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
}

function downloadElementAsPng(node, filename) {
  const width = Math.ceil(node.scrollWidth);
  const height = Math.ceil(node.scrollHeight);
  const clone = node.cloneNode(true);
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;min-height:${height}px;background:#e9ece8;">
      <style>${collectPageCss()}</style>
      ${clone.outerHTML}
    </div>
  `;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">${html}</foreignObject>
    </svg>
  `;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      resolve();
    };
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export default function RankingBoard({
  list,
  summary,
  comments,
  onBack,
  onSubmitRanking,
  onCreateComment,
  onLikeComment
}) {
  const tiers = list.tiers?.length ? list.tiers : DEFAULT_TIERS;
  const [draftItems, setDraftItems] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [draftCandidates, setDraftCandidates] = useState([]);
  const [supportedCandidateIds, setSupportedCandidateIds] = useState([]);
  const [dragItem, setDragItem] = useState(null);
  const [pointerDrag, setPointerDrag] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [candidateValue, setCandidateValue] = useState('');
  const [commentValue, setCommentValue] = useState('');
  const [cropDraft, setCropDraft] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropDrag, setCropDrag] = useState(null);
  const boardRef = useRef(null);
  const fileInputRef = useRef(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setDraftItems((list.items || []).map((item, index) => ({ ...item, localOrder: item.order ?? index })));
    setDeletedIds([]);
    setDraftCandidates([]);
    setSupportedCandidateIds([]);
    setDragItem(null);
    setPointerDrag(null);
    setSelectedItem(null);
    setSelectedTier(null);
    setCropDraft(null);
    setCommentValue('');
  }, [list.id, list.items]);

  useEffect(() => {
    if (!pointerDrag?.active) return undefined;
    document.body.classList.add('is-ranking-dragging');
    return () => document.body.classList.remove('is-ranking-dragging');
  }, [pointerDrag?.active]);

  const previewItems = useMemo(() => {
    const supported = (summary?.candidates || [])
      .filter((candidate) => supportedCandidateIds.includes(candidate.id))
      .map((candidate, index) => ({
        id: `supported-${candidate.id}`,
        sourceCandidateId: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        imageUrl: candidate.imageUrl,
        tierIndex: clampTier(candidate.tierIndex, tiers),
        localOrder: 10000 + index,
        preview: true,
        supportedPreview: true
      }));
    const local = draftCandidates.map((candidate, index) => ({
      ...candidate,
      localOrder: 11000 + index,
      preview: true
    }));
    return [...draftItems, ...supported, ...local];
  }, [draftCandidates, draftItems, summary, supportedCandidateIds, tiers]);

  const itemsByTier = useMemo(() => groupItems(previewItems, tiers), [previewItems, tiers]);

  const selectedTierCandidates = useMemo(() => {
    if (selectedTier === null) return [];
    const localCandidates = draftCandidates
      .filter((candidate) => candidate.tierIndex === selectedTier)
      .map((candidate) => ({ ...candidate, local: true, supportCount: 1 }));
    const serverCandidates = (summary?.candidates || [])
      .filter((candidate) => clampTier(candidate.tierIndex, tiers) === selectedTier)
      .sort((left, right) => right.supportCount - left.supportCount);
    return [...localCandidates, ...serverCandidates];
  }, [draftCandidates, selectedTier, summary, tiers]);

  const dirty =
    deletedIds.length > 0 ||
    draftCandidates.length > 0 ||
    supportedCandidateIds.length > 0 ||
    draftItems.some((item) => {
      const original = (list.items || []).find((entry) => entry.id === item.id);
      return original && clampTier(original.tierIndex, tiers) !== clampTier(item.tierIndex, tiers);
    });

  const normalizeOrders = (items) => {
    let next = items;
    tiers.forEach((_, tierIndex) => {
      const ordered = next
        .filter((item) => clampTier(item.tierIndex, tiers) === tierIndex)
        .sort((left, right) => (left.localOrder ?? left.order ?? 0) - (right.localOrder ?? right.order ?? 0));
      next = next.map((item) => {
        if (clampTier(item.tierIndex, tiers) !== tierIndex) return item;
        return { ...item, localOrder: ordered.findIndex((entry) => entry.id === item.id) };
      });
    });
    return next;
  };

  const moveItemToTierEnd = (itemId, tierIndex) => {
    setDraftItems((items) => {
      const maxOrder = Math.max(
        -1,
        ...items
          .filter((item) => clampTier(item.tierIndex, tiers) === tierIndex)
          .map((item) => item.localOrder ?? item.order ?? 0)
      );
      return normalizeOrders(
        items.map((item) => (item.id === itemId ? { ...item, tierIndex, localOrder: maxOrder + 1 } : item))
      );
    });
  };

  const insertItemNearTarget = (sourceId, targetId, after) => {
    setDraftItems((items) => {
      const source = items.find((item) => item.id === sourceId);
      const target = items.find((item) => item.id === targetId);
      if (!source || !target || source.id === target.id) return items;

      const targetTier = clampTier(target.tierIndex, tiers);
      const targetOrder = target.localOrder ?? target.order ?? 0;
      const insertedOrder = targetOrder + (after ? 0.5 : -0.5);
      return normalizeOrders(
        items.map((item) =>
          item.id === sourceId ? { ...item, tierIndex: targetTier, localOrder: insertedOrder } : item
        )
      );
    });
  };

  const insertItemAtDropPoint = (sourceId, tierIndex, container, clientX, clientY) => {
    const entries = Array.from(container.querySelectorAll('[data-item-id]'))
      .map((element) => ({
        id: element.dataset.itemId,
        rect: element.getBoundingClientRect()
      }))
      .filter((entry) => entry.id && entry.id !== sourceId)
      .sort((left, right) => {
        if (Math.abs(left.rect.top - right.rect.top) > 8) return left.rect.top - right.rect.top;
        return left.rect.left - right.rect.left;
      });

    const target = entries.find((entry) => {
      const centerX = entry.rect.left + entry.rect.width / 2;
      const centerY = entry.rect.top + entry.rect.height / 2;
      const sameRow = clientY >= entry.rect.top - 8 && clientY <= entry.rect.bottom + 8;
      return clientY < centerY || (sameRow && clientX < centerX);
    });

    if (target) {
      insertItemNearTarget(sourceId, target.id, false);
    } else {
      moveItemToTierEnd(sourceId, tierIndex);
    }
  };

  const removeItem = (itemId) => {
    setDraftItems((items) => normalizeOrders(items.filter((item) => item.id !== itemId)));
    setDeletedIds((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]));
  };

  const handleDropOnTier = (tierIndex) => (event) => {
    event.preventDefault();
    if (dragItem && !dragItem.preview) moveItemToTierEnd(dragItem.id, tierIndex);
    setDragItem(null);
    setDragOverTier(null);
  };

  const getDropTargets = (clientX, clientY) => {
    const elements =
      typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
    const closest = (selector) => elements.map((element) => element.closest?.(selector)).find(Boolean);
    return {
      deleteZone: closest('.delete-zone'),
      options: closest('.tier-options'),
      row: closest('.tier-row')
    };
  };

  const updateDragHover = (clientX, clientY) => {
    const { options, row } = getDropTargets(clientX, clientY);
    const targetRow = options?.closest('.tier-row') || row;
    const tierIndex = targetRow ? Number(targetRow.dataset.tierIndex) : null;
    setDragOverTier(Number.isFinite(tierIndex) ? tierIndex : null);
  };

  const startPointerDrag = (item) => (event) => {
    if (item.preview || (event.button !== undefined && event.button !== 0)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragItem(item);
    setPointerDrag({
      itemId: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false
    });
  };

  const movePointerDrag = (itemId) => (event) => {
    if (!pointerDrag || pointerDrag.itemId !== itemId || pointerDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    const active = pointerDrag.active || distance > 6;
    if (active) {
      event.preventDefault();
      updateDragHover(event.clientX, event.clientY);
    }
    setPointerDrag({ ...pointerDrag, x: event.clientX, y: event.clientY, active });
  };

  const finishPointerDrag = (itemId) => (event) => {
    if (!pointerDrag || pointerDrag.itemId !== itemId || pointerDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointerDrag.active) {
      event.preventDefault();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 250);

      const { deleteZone, options, row } = getDropTargets(event.clientX, event.clientY);
      if (deleteZone) {
        removeItem(itemId);
      } else if (options) {
        const targetRow = options.closest('.tier-row');
        const tierIndex = targetRow ? Number(targetRow.dataset.tierIndex) : null;
        if (Number.isFinite(tierIndex)) insertItemAtDropPoint(itemId, tierIndex, options, event.clientX, event.clientY);
      } else if (row) {
        const tierIndex = Number(row.dataset.tierIndex);
        if (Number.isFinite(tierIndex)) moveItemToTierEnd(itemId, tierIndex);
      }
    }

    setPointerDrag(null);
    setDragItem(null);
    setDragOverTier(null);
  };

  const cancelPointerDrag = () => {
    setPointerDrag(null);
    setDragItem(null);
    setDragOverTier(null);
  };

  const addDraftCandidate = (candidate) => {
    if (selectedTier === null) return;
    setDraftCandidates((items) => [
      ...items,
      {
        id: `local-${Date.now()}-${items.length}`,
        tierIndex: selectedTier,
        ...candidate
      }
    ]);
  };

  const stageSupportCandidate = (candidate) => {
    setSupportedCandidateIds((ids) => (ids.includes(candidate.id) ? ids : [...ids, candidate.id]));
  };

  const submitRanking = () => {
    onSubmitRanking({
      placements: draftItems.map((item) => ({
        itemId: item.id,
        tierIndex: clampTier(item.tierIndex, tiers)
      })),
      deleteItemIds: deletedIds,
      candidates: draftCandidates.map(({ id, local, supportCount, preview, ...candidate }) => candidate),
      supportCandidateIds: supportedCandidateIds
    });
  };

  const submitCandidate = (event) => {
    event.preventDefault();
    const value = candidateValue.trim();
    if (selectedTier === null || !value) return;
    addDraftCandidate({
      name: isImageValue(value) ? '图片选项' : value,
      kind: isImageValue(value) ? 'image' : 'text',
      imageUrl: isImageValue(value) ? value : ''
    });
    setCandidateValue('');
  };

  const handleCandidateFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setCropDraft(await fileToDataUrl(file));
  };

  const confirmCrop = async () => {
    if (!cropDraft) return;
    const imageUrl = await cropSquare(cropDraft, cropZoom, cropOffset);
    addDraftCandidate({ name: '图片选项', kind: 'image', imageUrl });
    setCropDraft(null);
  };

  const saveScreenshot = async () => {
    if (!boardRef.current) return;
    await downloadElementAsPng(boardRef.current, `${list.title || 'ranking'}-${Date.now()}.png`);
  };

  const submitComment = (event) => {
    event.preventDefault();
    const content = commentValue.trim();
    if (!content) return;
    onCreateComment(content);
    setCommentValue('');
  };

  const itemIntent = selectedItem ? summary?.itemIntent?.[selectedItem.id] : null;
  const itemIntentTotal = itemIntent
    ? tiers.reduce((total, _, index) => total + (itemIntent.targetCounts?.[index] || 0), itemIntent.deleteCount || 0)
    : 0;
  const maxCandidateSupport = Math.max(
    1,
    ...selectedTierCandidates.map((candidate) => candidate.supportCount || 0)
  );

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
          <span>下次整点更新</span>
          <strong>{formatTime(summary?.nextSettlementAt)}</strong>
        </div>
      </div>

      <div className="board-actions">
        <span>
          {summary?.pendingSubmissionCount || 0} 份待结算排序意愿
          {draftCandidates.length > 0 ? ` · 本次新增 ${draftCandidates.length} 个候选` : ''}
          {supportedCandidateIds.length > 0 ? ` · 本次支持 ${supportedCandidateIds.length} 个候选` : ''}
        </span>
        <div className="action-cluster">
          <button className="btn secondary" type="button" onClick={saveScreenshot}>
            保存截图
          </button>
          <button className="btn primary" type="button" disabled={!dirty} onClick={submitRanking}>
            提交本次表单
          </button>
        </div>
      </div>

      <div className="board-tip">
        点击左侧档位名称查看候选，按住图片拖动到目标档位后松手提交本次排序。
      </div>

      <div className="board-wrap" ref={boardRef}>
        <div className="tier-list">
          {tiers.map((tier, tierIndex) => (
            <section
              key={tier}
              data-tier-index={tierIndex}
              className={`tier-row tier-${tierIndex}${dragOverTier === tierIndex ? ' is-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTier(tierIndex);
              }}
              onDragLeave={() => setDragOverTier(null)}
              onDrop={handleDropOnTier(tierIndex)}
            >
              <button
                className="tier-label"
                type="button"
                title="点击查看候选"
                aria-label={`${tier}，点击查看候选`}
                onClick={() => setSelectedTier(tierIndex)}
              >
                <span className="tier-name">{tier}</span>
              </button>
              <div
                className="tier-options"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (dragItem && !dragItem.preview) {
                    insertItemAtDropPoint(dragItem.id, tierIndex, event.currentTarget, event.clientX, event.clientY);
                  }
                  setDragItem(null);
                  setDragOverTier(null);
                }}
              >
                {itemsByTier[tierIndex].map((item) => (
                  <button
                    key={item.id}
                    data-item-id={!item.preview ? item.id : undefined}
                    className={`option-tile${item.preview ? ' is-preview' : ''}${
                      item.supportedPreview ? ' is-supported' : ''
                    }${pointerDrag?.active && pointerDrag.itemId === item.id ? ' is-dragging' : ''}`}
                    draggable={false}
                    type="button"
                    onClick={() => {
                      if (item.preview || suppressClickRef.current) return;
                      setSelectedItem(item);
                    }}
                    onPointerDown={startPointerDrag(item)}
                    onPointerMove={movePointerDrag(item.id)}
                    onPointerUp={finishPointerDrag(item.id)}
                    onPointerCancel={cancelPointerDrag}
                    onDragStart={(event) => event.preventDefault()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (dragItem && !item.preview) {
                        const rect = event.currentTarget.getBoundingClientRect();
                        insertItemNearTarget(dragItem.id, item.id, event.clientX > rect.left + rect.width / 2);
                      }
                      setDragItem(null);
                      setDragOverTier(null);
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setDragOverTier(null);
                    }}
                    title="拖到某个选项左半边会插到它前面，拖到右半边会插到它后面"
                  >
                    <OptionImage item={item} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {dragItem && pointerDrag?.active ? (
        <div
          className="drag-ghost"
          style={{
            width: `${pointerDrag.width}px`,
            height: `${pointerDrag.height}px`,
            transform: `translate3d(${pointerDrag.x - pointerDrag.offsetX}px, ${
              pointerDrag.y - pointerDrag.offsetY
            }px, 0)`
          }}
        >
          <OptionImage item={dragItem} />
        </div>
      ) : null}

      {dragItem && pointerDrag?.active ? (
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

      <section className="comment-panel">
        <div className="comment-header">
          <h2>评论</h2>
          <span>{comments.length} 条</span>
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <input value={commentValue} onChange={(event) => setCommentValue(event.target.value)} placeholder="写一句评论" />
          <button className="btn primary" type="submit">
            发送
          </button>
        </form>
        <div className="comment-list">
          {comments.length === 0 ? (
            <p className="empty-state">还没有评论</p>
          ) : (
            comments.map((comment) => (
              <article key={comment.id} className="comment-item">
                <div>
                  <strong>@{comment.username}</strong>
                  <p>{comment.content}</p>
                </div>
                <button className="btn secondary" type="button" onClick={() => onLikeComment(comment.id)}>
                  赞 {comment.likeCount}
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      {selectedItem ? (
        <aside className="detail-drawer">
          <div className="drawer-header">
            <strong>{selectedItem.name}</strong>
            <button className="icon-btn" type="button" onClick={() => setSelectedItem(null)}>
              x
            </button>
          </div>
          <OptionImage item={selectedItem} />
          <div className="intent-list">
            {tiers.map((tier, index) => {
              const count = itemIntent?.targetCounts?.[index] || 0;
              const percent = itemIntentTotal > 0 ? Math.round((count / itemIntentTotal) * 100) : 0;
              return (
                <div key={tier} className="intent-row">
                  <span>{tier}</span>
                  <div className="heat-metric">
                    <strong>{count}</strong>
                    <div className="heat-bar" aria-label={`${tier} ${percent}%`}>
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="intent-row danger">
              <span>希望删除</span>
              <div className="heat-metric">
                <strong>{itemIntent?.deleteCount || 0}</strong>
                <div
                  className="heat-bar"
                  aria-label={`删除 ${
                    itemIntentTotal > 0 ? Math.round(((itemIntent?.deleteCount || 0) / itemIntentTotal) * 100) : 0
                  }%`}
                >
                  <span
                    style={{
                      width: `${
                        itemIntentTotal > 0 ? Math.round(((itemIntent?.deleteCount || 0) / itemIntentTotal) * 100) : 0
                      }%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      {selectedTier !== null ? (
        <aside className="detail-drawer wide">
          <div className="drawer-header">
            <strong>想加入「{tiers[selectedTier]}」的候选</strong>
            <button className="icon-btn" type="button" onClick={() => setSelectedTier(null)}>
              x
            </button>
          </div>
          <div className="candidate-list">
            {selectedTierCandidates.length === 0 ? (
              <p className="empty-state">暂无候选</p>
            ) : (
              selectedTierCandidates.map((candidate) => {
                const isSupported = supportedCandidateIds.includes(candidate.id);
                const percent = Math.round(((candidate.supportCount || 0) / maxCandidateSupport) * 100);
                return (
                  <button
                    key={candidate.id}
                    className={`candidate-card${candidate.local ? ' is-local' : ''}${
                      isSupported ? ' is-supported' : ''
                    }`}
                    type="button"
                    disabled={candidate.local || isSupported}
                    onClick={() => !candidate.local && stageSupportCandidate(candidate)}
                  >
                    <OptionImage item={candidate} />
                    <span>{candidate.name}</span>
                    <div className="candidate-heat">
                      <strong>{candidate.local ? '待提交' : isSupported ? '已暂存' : `热度 ${candidate.supportCount}`}</strong>
                      <div className="heat-bar" aria-label={`${candidate.name} ${percent}%`}>
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <form className="candidate-form" onSubmit={submitCandidate}>
            <input
              value={candidateValue}
              onChange={(event) => setCandidateValue(event.target.value)}
              placeholder="输入文字，或粘贴图片 URL"
            />
            <button className="btn primary" type="submit">
              加入本次表单
            </button>
          </form>
          <div
            className="image-drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleCandidateFile(event.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            拖入图片，或点击选择图片后裁剪为正方形
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => handleCandidateFile(event.target.files?.[0])}
            />
          </div>
        </aside>
      ) : null}

      {cropDraft ? (
        <div className="crop-modal">
          <div className="crop-box">
            <div className="drawer-header">
              <strong>裁剪为正方形</strong>
              <button className="icon-btn" type="button" onClick={() => setCropDraft(null)}>
                x
              </button>
            </div>
            <div
              className="crop-preview"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setCropDrag({ x: event.clientX, y: event.clientY, offset: cropOffset });
              }}
              onPointerMove={(event) => {
                if (!cropDrag) return;
                const nextX = cropDrag.offset.x + (event.clientX - cropDrag.x) / 120;
                const nextY = cropDrag.offset.y + (event.clientY - cropDrag.y) / 120;
                setCropOffset({
                  x: Math.max(-1, Math.min(1, nextX)),
                  y: Math.max(-1, Math.min(1, nextY))
                });
              }}
              onPointerUp={() => setCropDrag(null)}
              onPointerCancel={() => setCropDrag(null)}
            >
              <img
                src={cropDraft}
                alt="待裁剪图片"
                style={{
                  transform: `translate(${cropOffset.x * 34}px, ${cropOffset.y * 34}px) scale(${cropZoom})`
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
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
              />
            </label>
            <button className="btn primary" type="button" onClick={confirmCrop}>
              使用这张正方形图片
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
