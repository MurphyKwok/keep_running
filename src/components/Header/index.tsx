import useSiteMetadata from '@/hooks/useSiteMetadata';
import RunDataSync from '@/components/RunDataSync';

const Header = () => {
  const { logo, siteUrl, navLinks } = useSiteMetadata();

  return (
    <>
      <nav className="mt-12 flex w-full items-center justify-between pl-6 lg:px-16">
        <div className="flex w-1/2 items-center gap-3 lg:w-1/3">
          <a href={siteUrl} className="shrink-0">
            <picture>
              <img className="h-16 w-16 rounded-full" alt="logo" src={logo} />
            </picture>
          </a>
          <RunDataSync />
        </div>
        <div className="w-1/2 whitespace-nowrap text-right lg:w-2/3">
          {navLinks.map((n, i) => (
            <a
              key={i}
              href={n.url}
              className="mr-3 text-lg lg:mr-4 lg:text-base"
            >
              {n.name}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
};

export default Header;
