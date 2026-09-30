import { Trans } from '@lingui/react/macro';

/**
 * Where network users can obtain the Corresponding Source of this modified Documenso
 * (AGPL-3.0 §13). Must point at the public repository that is actually deployed.
 * See LICENSE_COMPLIANCE.md before changing or removing anything in this file.
 */
export const SOURCE_CODE_URL = 'https://github.com/Cook-Holdings/pinogy-sign';
export const UPSTREAM_URL = 'https://github.com/documenso/documenso';
export const LICENSE_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';

export type AppFooterProps = {
  /**
   * `full` (default): the attribution sentence, used on the app's own pages.
   * `compact`: a single, unobtrusive "Source code · AGPL-3.0" line for recipient (signing)
   * pages, which consumers see — often on a store's tablet. It still renders on every such page
   * and still links to the source, which is what keeps the §13 offer in place.
   */
  variant?: 'full' | 'compact';
};

export const AppFooter = ({ variant = 'full' }: AppFooterProps) => {
  if (variant === 'compact') {
    return (
      <footer className="mt-auto py-2">
        <div className="mx-auto flex max-w-screen-xl items-center justify-center gap-1.5 px-4 text-center text-muted-foreground text-xs">
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            <Trans>Source code</Trans>
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            AGPL-3.0
          </a>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto border-border border-t bg-muted/30 py-3">
      <div className="mx-auto flex max-w-screen-xl flex-col items-center justify-center gap-1 px-4 text-center text-muted-foreground text-xs md:flex-row md:gap-4">
        <span>
          <Trans>Based on</Trans>{' '}
          <a href={UPSTREAM_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            Documenso
          </a>
          . <Trans>Source code</Trans>:{' '}
          <a
            href={SOURCE_CODE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            github.com/Cook-Holdings/pinogy-sign
          </a>
        </span>
        <span>
          <Trans>Licensed under</Trans>{' '}
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            AGPL v3
          </a>
        </span>
      </div>
    </footer>
  );
};
