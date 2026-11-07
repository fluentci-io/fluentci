import { github, discord, bluesky, tangled } from "../../constants";
import { BrandIcon } from "../BrandIcon";
export function SiteFooter() {
  return (
    <footer className="page-width flex flex-col justify-between gap-6 border-t border-line py-8 text-xs text-muted sm:flex-row sm:items-center">
      <div>
        <p className="font-medium text-ink">Built for the way you build.</p>
        <p className="mt-2">
          Made with <span className="text-red-400">♥</span> in Antananarivo,
          Madagascar
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <a className="nav-link flex items-center gap-2" href={github}>
          <BrandIcon brand="github" />
          GitHub
        </a>
        <a className="nav-link flex items-center gap-2" href={discord}>
          <BrandIcon brand="discord" />
          Discord
        </a>
        <a className="nav-link flex items-center gap-2" href={bluesky}>
          <BrandIcon brand="bluesky" />
          Bluesky
        </a>
        <a className="nav-link flex items-center gap-2" href={tangled}>
          <BrandIcon brand="tangled" />
          Tangled
        </a>
        <a className="nav-link" href={`${github}/blob/main/LICENSE`}>
          Open source
        </a>
      </div>
    </footer>
  );
}
