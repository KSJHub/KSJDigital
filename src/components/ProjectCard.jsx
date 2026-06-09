export default function ProjectCard({ title, type, status, text }) {
  return (
    <article className="card project-card">
      <div className="project-preview">
        <span>{title}</span>
      </div>
      <span className="card-label">{type}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <p className="project-status">{status}</p>
    </article>
  );
}
