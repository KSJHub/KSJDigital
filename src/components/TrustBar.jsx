export default function TrustBar({ items }) {
  return (
    <section className="trust-bar" aria-label="KSJ Digital trust points">
      <div className="container trust-list">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}
