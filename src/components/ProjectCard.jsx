export default function ProjectCard({ title, type, status, text }) {
  return (
    <article className="card project-card">
      <div className="project-preview">
        <span>Preview Coming Soon</span>
      </div>

      <span className="card-label">{type}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="project-status">{status}</div>
    </article>
  );
}
