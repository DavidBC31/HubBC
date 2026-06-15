import "./justif.css";

export default function JustifLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="justif-root">
      <div className="justif-wrap">{children}</div>
    </div>
  );
}
