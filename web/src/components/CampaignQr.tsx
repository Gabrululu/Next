"use client";

// Share block shown on every campaign page: a QR of the page link (scan to open on a phone) + copy.
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export function CampaignQr() {
  const t = useT();
  const [url, setUrl] = useState("");
  const [img, setImg] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const href = window.location.href.split("#")[0]!;
    setUrl(href);
    QRCode.toDataURL(href, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#0a090c", light: "#f5f3f7" } })
      .then(setImg)
      .catch(() => setImg(undefined));
  }, []);

  return (
    <div className="flex items-center gap-4 border-t border-line pt-5">
      <div className="shrink-0 rounded-xl bg-paper p-1.5 size-24 grid place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img ? <img src={img} alt={t("QR code to open this campaign")} width={84} height={84} className="size-[84px]" /> : null}
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm">{t("Scan to open this campaign on a phone, or share the link.")}</p>
        <button
          onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="label underline text-left"
        >
          {copied ? t("Link copied") : t("Copy link")}
        </button>
      </div>
    </div>
  );
}
