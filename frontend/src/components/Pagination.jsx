export default function Pagination({ pagination, onPageChange, onPageSizeChange }) {
  const page = Number(pagination?.page) || 1;
  const pageSize = Number(pagination?.pageSize) || 10;
  const total = Number(pagination?.total) || 0;
  const totalPages = Math.max(1, Number(pagination?.totalPages) || Math.ceil(total / pageSize) || 1);
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="pagination">
      <div className="pagination-summary">共 {total} 条，显示 {start}–{end} 条</div>
      <label className="pagination-size">
        每页
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        条
      </label>
      <div className="pagination-buttons">
        <button type="button" className="icon-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="上一页">‹</button>
        <span>第 {page} / {totalPages} 页</span>
        <button type="button" className="icon-button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="下一页">›</button>
      </div>
    </div>
  );
}
