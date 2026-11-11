import { useEffect, useState } from 'react';
import Icon from './Icon';
import { api, errorText, type BusinessRow, type SessionInfo, type TeamMember } from '../api';

interface Props {
  session: SessionInfo;
  onClose: () => void;
  onSwitched: () => void;
  onRenamed: () => void;
}

const blankMember = { name: '', email: '', password: '', role: 'member' as 'admin' | 'member' };
const blankBiz = { name: '', adminName: '', adminEmail: '', adminPassword: '' };

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="team-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.changePassword(current, next);
          setMsg({ ok: true, text: 'Password changed.' });
          setCurrent('');
          setNext('');
        } catch (err) {
          setMsg({ ok: false, text: errorText(err) });
        }
      }}
    >
      <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <button className="btn small" disabled={!current || !next}>Change password</button>
      {msg && <p className={msg.ok ? 'ok small' : 'error small'}>{msg.text}</p>}
    </form>
  );
}

export default function TeamDialog({ session, onClose, onSwitched, onRenamed }: Props) {
  const user = session.user!;
  const canManage = user.superadmin || user.role === 'admin';
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [member, setMember] = useState(blankMember);
  const [biz, setBiz] = useState(blankBiz);
  const [bizName, setBizName] = useState(session.business?.name ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = () => {
    if (canManage) api.team().then(setTeam).catch((e) => setError(errorText(e)));
    if (user.superadmin) api.businesses().then(setBusinesses).catch((e) => setError(errorText(e)));
  };
  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      if (done) setNotice(done);
      refresh();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal team-modal" role="dialog" aria-label="Team">
        <header>
          <h2>{canManage ? session.business?.name : 'My account'}</h2>
          <button className="icon-btn" onClick={onClose} title="Close">
            <Icon name="x" />
          </button>
        </header>
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}

        {canManage && (
          <section className="team-section">
            <h3>Business name</h3>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.renameBusiness(session.business!.id, bizName).then(onRenamed), 'Saved.');
              }}
            >
              <input value={bizName} onChange={(e) => setBizName(e.target.value)} />
              <button className="btn small" disabled={!bizName.trim() || bizName === session.business?.name}>Save</button>
            </form>
          </section>
        )}

        {canManage && (
          <section className="team-section">
            <h3>People</h3>
            <p className="muted small">Everyone here sees and edits this business’s designs, flyers and products. Admins can also add people and make backups.</p>
            <table className="team-table">
              <tbody>
                {team?.map((m) => (
                  <tr key={m.id} className={m.disabled ? 'disabled' : ''}>
                    <td>
                      <strong>{m.name || '—'}</strong>
                      <small>{m.email}</small>
                    </td>
                    <td>
                      {m.is_superadmin ? (
                        <span className="badge">Install owner</span>
                      ) : (
                        <select
                          value={m.role}
                          disabled={m.id === user.id}
                          onChange={(e) => act(() => api.updateTeamMember(m.id, { role: e.target.value as 'admin' | 'member' }))}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="team-actions">
                      <button
                        className="btn small"
                        onClick={() => {
                          const pw = prompt(`New password for ${m.email} (8+ characters):`);
                          if (pw) act(() => api.updateTeamMember(m.id, { password: pw }), `Password reset for ${m.email}.`);
                        }}
                      >
                        Reset password
                      </button>
                      {m.id !== user.id && !m.is_superadmin && (
                        <button className="btn small" onClick={() => act(() => api.updateTeamMember(m.id, { disabled: !m.disabled }))}>
                          {m.disabled ? 'Turn on' : 'Turn off'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form
              className="team-form"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => api.addTeamMember(member).then(() => setMember(blankMember)), `Added ${member.email}. Send them the password you chose.`);
              }}
            >
              <h4>Add a person</h4>
              <input placeholder="Name" value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} />
              <input type="email" placeholder="Email" value={member.email} onChange={(e) => setMember({ ...member, email: e.target.value })} />
              <input type="text" placeholder="Starting password (8+ characters)" value={member.password} onChange={(e) => setMember({ ...member, password: e.target.value })} autoComplete="off" />
              <select value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value as 'admin' | 'member' })}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn primary small" disabled={!member.email || !member.password}>Add person</button>
            </form>
          </section>
        )}

        {user.superadmin && (
          <section className="team-section">
            <h3>Businesses on this install</h3>
            <p className="muted small">Each business has its own designs, flyers, products, uploads and subscriber list. Switch to one to work in it.</p>
            <ul className="biz-list">
              {businesses?.map((b) => (
                <li key={b.id} className={b.id === session.business?.id ? 'on' : ''}>
                  <span>
                    <strong>{b.name}</strong>
                    <small>
                      {b.user_count} {b.user_count === 1 ? 'person' : 'people'}
                    </small>
                  </span>
                  {b.id === session.business?.id ? (
                    <span className="badge">Working here</span>
                  ) : (
                    <button className="btn small" onClick={() => act(() => api.switchBusiness(b.id).then(onSwitched))}>
                      Switch to
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="team-form"
              onSubmit={(e) => {
                e.preventDefault();
                const body = biz.adminEmail ? biz : { name: biz.name };
                act(() => api.createBusiness(body).then(() => setBiz(blankBiz)), `Created ${biz.name}.`);
              }}
            >
              <h4>Add a business</h4>
              <input placeholder="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
              <input placeholder="Their admin’s name (optional)" value={biz.adminName} onChange={(e) => setBiz({ ...biz, adminName: e.target.value })} />
              <input type="email" placeholder="Their admin’s email (optional)" value={biz.adminEmail} onChange={(e) => setBiz({ ...biz, adminEmail: e.target.value })} />
              <input type="text" placeholder="Starting password" value={biz.adminPassword} onChange={(e) => setBiz({ ...biz, adminPassword: e.target.value })} autoComplete="off" />
              <button className="btn primary small" disabled={!biz.name.trim()}>Add business</button>
            </form>
          </section>
        )}

        <section className="team-section">
          <h3>Your password</h3>
          <PasswordForm />
        </section>
      </div>
    </div>
  );
}
