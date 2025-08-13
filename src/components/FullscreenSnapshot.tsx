type Props = {
  dataUrl: string;
  html?: string;
};

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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

      <div className="flex flex-row items-center fixed bottom-0 right-0 p-1 px-2 rounded-full bg-zinc-900/50 backdrop-blur-sm border border-white/10 m-2">
        <Link href="/" className="text-sm text-white flex flex-row items-center gap-1">
          <ArrowLeft className="size-4 text-white" />
          Go Back
        </Link>
      </div>
    </>
  );
}

