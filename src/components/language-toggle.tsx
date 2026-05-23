"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Globe } from "lucide-react";
import { useTransition } from "react";

export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations("LanguageToggle");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale = locale === "en" ? "zh" : "en";

  const handleSwitch = () => {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <button
      onClick={handleSwitch}
      disabled={isPending}
      className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer disabled:opacity-50"
      aria-label={t("tooltip")}
    >
      <Globe className="h-3.5 w-3.5" />
      <span className="text-[10px] font-semibold uppercase tracking-tight">
        {locale === "en" ? "zh" : "en"}
      </span>
    </button>
  );
}
