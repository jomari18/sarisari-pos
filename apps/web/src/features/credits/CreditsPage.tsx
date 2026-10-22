import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { BrandMark } from "../../components/BrandMark";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";
const link = "font-medium text-accent underline underline-offset-2";

function Credit({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-card bg-surface p-6">
      <h2 id={id} className="text-lg font-medium">
        {title}
      </h2>
      <p className="leading-relaxed text-muted">{children}</p>
    </section>
  );
}

/** Spec 11.1 and 11.5: whose work ZariZari is built on, and under which licenses. */
export function CreditsPage() {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-5 md:px-8">
        <Link to="/" className="flex items-center gap-3 font-semibold uppercase tracking-[0.12em] text-accent">
          <BrandMark size={34} />
          ZariZari
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-16 pt-6 md:px-8">
        <h1 className="text-3xl font-semibold">Credits</h1>
        <p className="text-muted">ZariZari is built on other people&apos;s generous work. Thank you.</p>
        <Credit title="Design">
          {'UI adapted from "POS System Web UI" by Abubakar Sherazi (Figma Community), licensed under CC BY 4.0 ('}
          <a href={CC_BY} className={`${link} break-all`}>
            {CC_BY}
          </a>
          {"). Changes: blue accent, new brand, sari-sari screens and content, icons."}
        </Credit>
        <Credit title="Icons">
          Icons from{" "}
          <a href="https://lucide.dev" className={link}>
            Lucide
          </a>
          , under the{" "}
          <a href="https://lucide.dev/license" className={link}>
            ISC License
          </a>
          .
        </Credit>
        <Credit title="Font">
          Poppins by Indian Type Foundry, under the{" "}
          <a href="https://openfontlicense.org/" className={link}>
            SIL Open Font License 1.1
          </a>
          , served with the app through Fontsource.
        </Credit>
        <Credit title="3D tindahan">
          The store on the home page is built in code from simple shapes, with no downloaded models, using{" "}
          <a href="https://github.com/mrdoob/three.js/blob/dev/LICENSE" className={link}>
            three.js
          </a>{" "}
          and{" "}
          <a href="https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE" className={link}>
            React Three Fiber
          </a>{" "}
          (both MIT License).
        </Credit>
        <Credit title="Barcode scanning">
          Where the browser cannot read barcodes by itself, ZXing does: the library under the{" "}
          <a href="https://github.com/zxing-js/library/blob/master/LICENSE" className={link}>
            Apache License 2.0
          </a>{" "}
          and its browser package under the{" "}
          <a href="https://github.com/zxing-js/browser/blob/master/LICENSE" className={link}>
            MIT License
          </a>
          .
        </Credit>
      </main>
    </div>
  );
}
