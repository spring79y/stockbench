import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

type LegalDocShellProps = {
  title: string;
  children: ReactNode;
};

export function LegalDocShell({ title, children }: LegalDocShellProps) {
  return (
    <>
      <SiteHeader />
      <main className="legal-doc">
        <h1 className="legal-doc__title">{title}</h1>
        <p className="legal-doc__draft-note">
          본 문서는 서비스 운영을 위한 초안이며, 법률 자문이 아닙니다. 실제 적용 전 필요 시
          전문가 검토를 권장합니다.
        </p>
        <div className="legal-doc__body">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
