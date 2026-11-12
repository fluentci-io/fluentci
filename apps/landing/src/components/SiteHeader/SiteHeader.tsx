import { Link } from "@tanstack/react-router";
import { validateCatalogSearch } from "../ModulesPage/filters";
import { ModuleSearch } from "../ModuleSearch";
import { AccountMenu } from "../AccountMenu";
import { ThemeSwitcher } from "../ThemeSwitcher";
import { BrandIcon } from "../BrandIcon";
import { github, docs, discord, bluesky, tangled } from "../../constants";

export function SiteHeader() {
  return (
    <header className="page-width flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-line py-6">
      <Link
        to="/"
        aria-label="FluentCI home"
        className="flex items-center gap-2.5"
      >
        <img src="/fluentci-logo.png" alt="" width="36" height="36" />
        <span className="text-lg tracking-tight">
          <span className="font-light">fluent</span>
          <span className="font-bold">ci</span>
        </span>
      </Link>
      <nav
        aria-label="Main navigation"
        className="flex flex-wrap items-center gap-4 text-xs sm:gap-5 sm:text-sm"
      >
        <ModuleSearch />
        <Link
          className="nav-link"
          to="/modules"
          search={validateCatalogSearch({})}
          activeProps={{ className: "text-accent" }}
        >
          Modules
        </Link>
        <Link className="nav-link" to="/" hash="sdks">
          SDKs
        </Link>
        <a className="nav-link" href={docs}>
          Docs
        </a>
        <a
          className="nav-link flex items-center gap-2"
          href={github}
          aria-label="GitHub"
          title="GitHub"
        >
          <BrandIcon brand="github" />
        </a>
        <a
          className="nav-link flex items-center gap-2"
          href={discord}
          aria-label="Discord"
          title="Discord"
        >
          <BrandIcon brand="discord" />
        </a>
        <a
          className="nav-link flex items-center gap-2"
          href={bluesky}
          aria-label="Bluesky"
          title="Bluesky"
        >
          <BrandIcon brand="bluesky" />
        </a>
        <a
          className="nav-link flex items-center gap-2"
          href={tangled}
          aria-label="Tangled"
          title="Tangled"
        >
          <BrandIcon brand="tangled" />
        </a>
        <ThemeSwitcher />
        <AccountMenu />
      </nav>
    </header>
  );
}
