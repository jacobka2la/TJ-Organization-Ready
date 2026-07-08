const Footer = () => {
  return (
    <footer className="border-t border-border bg-card">
      <div className="section-container py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} TJ Organization. Private legal file workspace.</p>
        <p>Login required • No indexing • Internal use only</p>
      </div>
    </footer>
  );
};

export default Footer;
