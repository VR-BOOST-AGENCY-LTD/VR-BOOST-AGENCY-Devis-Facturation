export function PdfPreview({ src, title }: { src: string; title: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex gap-2">
          <a href={src} target="_blank" rel="noreferrer" className="btn-ghost">Ouvrir</a>
          <a href={`${src}?download=1`} className="btn-primary">Télécharger PDF</a>
        </div>
      </div>
      <iframe src={src} title={title} className="h-[80vh] w-full bg-mist" />
    </section>
  );
}
