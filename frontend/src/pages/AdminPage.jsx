import { useMemo } from "react";
import * as adminApi from "../api/adminApi";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Spinner from "../components/Spinner";
import useAuth from "../hooks/useAuth";
import useDialogs from "../hooks/useDialogs";
import useResource from "../hooks/useResource";
import useToast from "../hooks/useToast";
import { errorMessage, formatBytes, formatJoinDate, formatNumber } from "../utils/format";

function AdminPage({ version, onChanged }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const { confirm } = useDialogs();
  const { data, error, loading, refreshing } = useResource("admin-users", adminApi.listUsers, version);

  const users = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const totals = useMemo(
    () => ({
      users: users.length,
      storage: users.reduce((sum, user) => sum + (user.storageUsed || 0), 0),
      files: users.reduce((sum, user) => sum + (user.fileCount || 0), 0),
    }),
    [users],
  );

  async function remove(user) {
    const ok = await confirm({
      title: "사용자를 삭제할까요?",
      message: `${user.name} (${user.email}) 계정과 모든 파일이 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`${user.email} 계정을 삭제했습니다.`);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, "사용자를 삭제하지 못했습니다."));
    }
  }

  let body;
  if (loading) {
    body = (
      <div className="center-pad">
        <Spinner size={32} />
      </div>
    );
  } else if (error) {
    body = (
      <EmptyState variant="error" title="사용자 목록을 불러오지 못했습니다" description={errorMessage(error)}>
        <button type="button" className="btn btn-primary" onClick={onChanged}>
          다시 시도
        </button>
      </EmptyState>
    );
  } else if (users.length === 0) {
    body = <EmptyState variant="users" title="사용자가 없습니다" />;
  } else {
    body = (
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">사용자</th>
              <th scope="col">권한</th>
              <th scope="col" className="num">
                사용량
              </th>
              <th scope="col" className="num">
                파일 수
              </th>
              <th scope="col">가입일</th>
              <th scope="col">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === me.id;
              return (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar user={user} size={32} />
                      <div>
                        <strong>
                          {user.name}
                          {self ? <span className="badge badge-soft">나</span> : null}
                        </strong>
                        <span className="muted small">{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge${user.role === "ADMIN" ? " badge-admin" : ""}`}>
                      {user.role === "ADMIN" ? "관리자" : "사용자"}
                    </span>
                  </td>
                  <td className="num">{formatBytes(user.storageUsed)}</td>
                  <td className="num">{formatNumber(user.fileCount)}</td>
                  <td>{formatJoinDate(user.createdAt)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm"
                      disabled={self}
                      title={self ? "자기 자신은 삭제할 수 없습니다" : undefined}
                      onClick={() => remove(user)}
                      aria-label={`${user.email} 삭제`}
                    >
                      <Icon name="trash" size={16} />
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="settings-page wide">
      <div className="page-head">
        <div className="page-heading">
          <h1 className="page-title">관리자</h1>
          {refreshing ? <Spinner size={16} label="새로고침 중" /> : null}
        </div>
      </div>
      {!loading && !error ? (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">전체 사용자</span>
            <strong className="stat-value">{formatNumber(totals.users)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">전체 파일</span>
            <strong className="stat-value">{formatNumber(totals.files)}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">전체 사용량</span>
            <strong className="stat-value">{formatBytes(totals.storage)}</strong>
          </div>
        </div>
      ) : null}
      <section className="card flush">{body}</section>
    </div>
  );
}

export default AdminPage;
