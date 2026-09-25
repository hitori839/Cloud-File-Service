import Logo from "./Logo";

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
      </div>
      <main className="auth-card">
        <div className="auth-brand">
          <Logo size={44} withText={false} />
          <span className="auth-product">Cloud Drive</span>
        </div>
        <h1>{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="auth-footer">{footer}</div> : null}
      </main>
    </div>
  );
}

export default AuthLayout;
