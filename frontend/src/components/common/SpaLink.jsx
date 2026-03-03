export default function SpaLink({ href, className, children, ...props }) {
  return (
    <a data-spa-link href={href} className={className} {...props}>
      {children}
    </a>
  );
}
