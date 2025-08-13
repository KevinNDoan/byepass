type Props = {
  dataUrl: string;
  html?: string;
};

import Link from "next/link";

export function FullscreenSnapshot({ dataUrl, html }: Props) {
  return (
    <>
      <iframe
        title="Archived Snapshot"
        src={html ? "about:blank" : dataUrl}
        srcDoc={html}
        className="fixed inset-0 w-screen h-[100dvh] border-0 m-0 p-0"
        style={{ display: "block", overflow: "auto" }}
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation"
      />
      <div className="fixed bottom-0 right-0 p-4 rounded-full bg-zinc-900/50 backdrop-blur-sm border border-white/10">
        <Link href="/" className="text-white">Back</Link>
      </div>
    </>
  );
}

