"use client";

import { ArrowRight } from "lucide-react";
import type { FormEvent } from "react";

type Props = {
  defaultUrl: string;
};

export function CaptureForm({ defaultUrl }: Props) {
  return (
    <form
      className="flex flex-row justify-center z-10 text-white mx-auto w-full sm:w-auto px-4"
      method="get"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.querySelector('input[name="url"]') as HTMLInputElement | null;
        if (!input) return;
        const raw = (input.value || "").trim();
        if (!raw) return;
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
        const normalized = hasScheme ? raw : `https://${raw}`;
        const params = new URLSearchParams();
        params.set("url", normalized);
        params.set("type", "html");
        window.location.href = `/?${params.toString()}`;
      }}
    >
     <div className="flex flex-row items-center bg-white/20 border border-white/20 rounded-full p-2 w-full">
      <input
        className="w-full sm:w-[520px] outline-none ms-3"
        type="text"
        name="url"
        placeholder="example.com/article"
        defaultValue={defaultUrl}
        required
        autoFocus
        autoComplete="off"
        inputMode="url"
        spellCheck={false}
        />
        <button className="p-1 aspect-square rounded-full bg-white text-black transition-colors cursor-pointer" type="submit">
          <ArrowRight className="size-5" />
        </button>
     </div>
    </form>
  );
}

