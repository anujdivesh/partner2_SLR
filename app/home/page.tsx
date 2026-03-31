import Link from "next/link";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const COUNTRIES = [
  { slug: "cok", code: "COK", name: "Cook Islands"     },
  { slug: "mhl", code: "MHL", name: "Marshall Islands" },
  { slug: "ton", code: "TON", name: "Tonga"             },
  { slug: "tuv", code: "TUV", name: "Tuvalu"            },
  { slug: "vut", code: "VUT", name: "Vanuatu"           },
  { slug: "wsm", code: "WSM", name: "Samoa"             },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>PARTNER2 SLR Dashboard</h1>
      <p className={styles.subtitle}>Select a country to explore sea level rise projections</p>

      <div className={styles.grid}>
        {COUNTRIES.map(({ slug, code, name }) => (
          <Link key={slug} href={`/home/${slug}`} className={styles.tile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/dataset/${code}/${code}.png`}
              alt={`${name} flag`}
              className={styles.flagImg}
            />
            <span className={styles.name}>{name}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}