// SPA 라우터: URL ↔ 페이지 모듈 매칭, a[href] 인터셉트, popstate 처리, 포커스 이동, 404 처리

type Cleanup = () => void;
type Ctx = { params?: Record<string, string>; url: URL };
type PageModule = { default: (root: HTMLElement, ctx: Ctx) => Cleanup | void };
type Importer = (m: RegExpMatchArray) => Promise<PageModule>;

// 경로 테이블 (정규식 → 해당 페이지 동적 import)
const routes: [RegExp, Importer][] = [
  [/^\/$/,                    () => import("../pages/lobby") as Promise<PageModule>],
  [/^\/init$/,                () => import("../pages/init") as Promise<PageModule>],
  [/^\/local$/,               () => import("../pages/local") as Promise<PageModule>],
  [/^\/tournaments$/,         () => import("../pages/tournaments") as Promise<PageModule>],
  [/^\/tournaments\/([^/]+)$/,() => import("../pages/tournament-detail") as Promise<PageModule>],
  [/^\/game\/([^/]+)$/,       () => import("../pages/game") as Promise<PageModule>],
];

export function initRouter(root: HTMLElement) {
	let cleanup: Cleanup | undefined;

	/*
		Manually off the browser's basic setting of scroll Restroation

		기본 복원 옵션 꺼주는 이유:
		1. 일관성:
			브라우저, 플랫폼마다 자동 복원 타이밍이 달라서 결과가 다르다.
			manual로 처음부터 꺼버리고 항상 같은 로직 (저장 -> 복원) 사용하면 안정적이다.
		2. 변화 대응:
			페이지 전환 후 이미지가 늦게 로드 될 경우 자동복원 시 틀린 위치로 복원될수 있다.
			직접 복원하면 좀 더 정확하다.
	*/
	if ("scrollRestoration" in history) {
		try { history.scrollRestoration = "manual"; } catch {}
	}

  // Save current scroll to history.
  function saveScroll() {
    const prev = history.state ?? {};
    try {
      history.replaceState(
        { ...prev, scrollX: window.scrollX, scrollY: window.scrollY },
        "",
        location.pathname + location.search,
      );
    } catch {}
  }

  async function render(path: string) {
    // clean-up 'previous page'
    cleanup?.();

    const url = new URL(path, location.origin);
    const pathname = url.pathname;

    // Find matching router.
    const hit = routes.find(([re]) => re.test(pathname));
	if (!hit) {
      const mod = (await import("../pages/not-found")) as PageModule;
      cleanup = mod.default(root, { url }) || undefined;
      postRenderFocus();
      return;
    }

    const [re, importer] = hit;
    const m = pathname.match(re)!;
    const mod = await importer(m);

    // /:id 한 개만 캡처하는 패턴 가정
    const params = m[1] ? { id: m[1] } : undefined;

    // 페이지 렌더 (clean-up 반환 가능)
    cleanup = mod.default(root, { params, url }) || undefined;

    postRenderFocus();
  }

  // 내부 링크 인터셉트 (새탭/중클릭/수정키는 통과)
	document.addEventListener("click", (e) => {
		const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
		if (!a) return;

		const me = e as MouseEvent;
		if (me.defaultPrevented) return;
		if (me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;

		const url = new URL(a.href, location.origin);
		if (url.origin !== location.origin) return; // 외부 링크는 통과

		const next = url.pathname + url.search;
		const curr = location.pathname + location.search;
		if (next === curr) { e.preventDefault(); return; }

		e.preventDefault();

		// Before leaving page, save current scroll
		saveScroll();	

		// 
		history.pushState({ scrollX: 0, scrollY: 0 }, "", next);
		render(next);
	});

	/*
		Basic: popstate - move forward, backward
		= 스크롤의 위치를 별도로 저장해주지 않았기에
		  스크롤을 내려서 웹페이지 아래쪽에 있다가
		  back을 누르고 다시 forward를 누를 경우
		  원래 위치해 있던 스크룰 위치에 도달하는게 아니라
		  웹의 가장 윗쪽으로 이동해있게 된다.
	*/
	// window.addEventListener("popstate", () => {
	// 	render(location.pathname + location.search);
	// });

	// popState: move forward & backward
	// ! AND ! save scroll last position
	window.addEventListener("popstate", (ev: PopStateEvent) => {
		render(location.pathname + location.search);

		// 스크롤 복원
		const s = (ev.state ?? {}) as { scrollX?: number; scrollY?: number };
		if (typeof s.scrollY === "number") {
			window.scrollTo(s.scrollX ?? 0, s.scrollY);	// 저장된 스크롤로 복원 (없으면 0,0)
		}
	});

  	// 전환 후 포커스 (a11y)
	// 화면 전환 후 브라우저의 포커스를 어디로할지 결정한다.
	function postRenderFocus() {
    	document.getElementById("app")?.focus({ preventScroll: true });
	}

	return { render };
}

// Programatic navigation
export function navigate(to: string)
{
	const next = to.startsWith("/") ? to : "/" + to;

	// 페이지 떠나기 전 현재 스크롤 저장
	try {
		const prev = history.state ?? {};
		history.replaceState(
			{ ...prev, scrollX: window.scrollX, scrollY: window.scrollY },
			"",
			location.pathname + location.search,
		);
	} catch {}

	// basic scroll state (맨 위) pops
	history.pushState({ scrollX: 0, scrollY: 0 }, "", next);
	dispatchEvent(new PopStateEvent("popstate"));
}

// replaceState
export function replace(to: string) {
	const next = to.startsWith("/") ? to : "/" + to;

	// 떠나기 전 현재 스크롤 저장
	try {
    	const prev = history.state ?? {};
		history.replaceState(
			{ ...prev, scrollX: window.scrollX, scrollY: window.scrollY },
      		"",
      		location.pathname + location.search,
    	);
	} catch {}

	history.replaceState({ scrollX: 0, scrollY: 0 }, "", next);
	dispatchEvent(new PopStateEvent("popstate"));
}