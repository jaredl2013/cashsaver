import Icon from './Icon';
import { useEditor } from '../store';

/** Page tabs for multi-page designs such as circulars and sales papers. */
export default function PageBar() {
  const count = useEditor((s) => s.design.pages.length);
  const index = useEditor((s) => s.pageIndex);
  const { goToPage, addPage, duplicatePage, deletePage, movePage } = useEditor.getState();

  return (
    <div className="pagebar" role="toolbar" aria-label="Pages">
      <div className="page-tabs">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} className={`page-tab ${i === index ? 'on' : ''}`} onClick={() => goToPage(i)} title={`Go to page ${i + 1}`}>
            {i + 1}
          </button>
        ))}
      </div>
      <button className="chip" onClick={() => addPage()} title="Add a page after this one">
        <Icon name="plus" size={13} /> Page
      </button>
      <span className="pagebar-sep" />
      <button className="icon-btn sm" title="Move page earlier" disabled={index === 0} onClick={() => movePage(index, index - 1)}>
        <Icon name="up" size={14} />
      </button>
      <button className="icon-btn sm" title="Move page later" disabled={index === count - 1} onClick={() => movePage(index, index + 1)}>
        <Icon name="down" size={14} />
      </button>
      <button className="icon-btn sm" title="Duplicate page" onClick={() => duplicatePage(index)}>
        <Icon name="copy" size={14} />
      </button>
      <button
        className="icon-btn sm"
        title="Delete page"
        disabled={count <= 1}
        onClick={() => {
          const empty = useEditor.getState().design.pages[index].elements.length === 0;
          if (empty || confirm(`Delete page ${index + 1}? You can undo this.`)) deletePage(index);
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
