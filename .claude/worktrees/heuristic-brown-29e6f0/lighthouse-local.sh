#!/bin/bash
# Lighthouse local — 5 runs par page, médiane stable
# Usage : ./lighthouse-local.sh
# Prérequis : Node 18+, Chrome installé
# Install : npm install -g lighthouse

set -e

URLS=(
  "https://www.nomacast.fr/"
  "https://www.nomacast.fr/tarifs.html"
  "https://www.nomacast.fr/streaming-multi-plateformes.html"
  "https://www.nomacast.fr/captation-evenement-entreprise.html"
  "https://www.nomacast.fr/en/"
  "https://www.nomacast.fr/en/pricing.html"
  "https://www.nomacast.fr/en/corporate-event-filming.html"
  "https://www.nomacast.fr/cas-client-louvre-lahorde.html"
  "https://www.nomacast.fr/cas-client-comedie-francaise.html"
)

mkdir -p ./lighthouse-results
> ./lighthouse-results/summary.tsv
echo -e "URL\tRun1\tRun2\tRun3\tRun4\tRun5\tMédiane\tLCP_med\tTBT_med\tCLS_med" >> ./lighthouse-results/summary.tsv

for url in "${URLS[@]}"; do
  slug=$(echo "$url" | sed 's|https://www.nomacast.fr/||' | sed 's|/$|index|' | sed 's|/|_|g' | sed 's|\.html||')
  [ -z "$slug" ] && slug="index"

  echo ""
  echo "▶ Test $url"

  scores=()
  lcps=()
  tbts=()
  clss=()

  for i in 1 2 3 4 5; do
    out="./lighthouse-results/${slug}_run${i}.json"
    lighthouse "$url" \
      --only-categories=performance \
      --form-factor=mobile \
      --throttling-method=simulate \
      --output=json --quiet --no-update-notifier \
      --chrome-flags="--headless --no-sandbox" \
      --output-path="$out" 2>/dev/null

    score=$(node -e "console.log(Math.round(JSON.parse(require('fs').readFileSync('$out')).categories.performance.score*100))")
    lcp=$(node -e "console.log(Math.round(JSON.parse(require('fs').readFileSync('$out')).audits['largest-contentful-paint'].numericValue))")
    tbt=$(node -e "console.log(Math.round(JSON.parse(require('fs').readFileSync('$out')).audits['total-blocking-time'].numericValue))")
    cls=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$out')).audits['cumulative-layout-shift'].numericValue.toFixed(3))")

    echo "  Run $i : score=$score | LCP=${lcp}ms | TBT=${tbt}ms | CLS=$cls"
    scores+=($score)
    lcps+=($lcp)
    tbts+=($tbt)
    clss+=($cls)
  done

  # Médianes
  sorted_scores=($(printf "%s\n" "${scores[@]}" | sort -n))
  med_score=${sorted_scores[2]}
  sorted_lcps=($(printf "%s\n" "${lcps[@]}" | sort -n))
  med_lcp=${sorted_lcps[2]}
  sorted_tbts=($(printf "%s\n" "${tbts[@]}" | sort -n))
  med_tbt=${sorted_tbts[2]}
  sorted_clss=($(printf "%s\n" "${clss[@]}" | sort -n))
  med_cls=${sorted_clss[2]}

  echo "  ★ MÉDIANE : score=$med_score | LCP=${med_lcp}ms | TBT=${med_tbt}ms | CLS=$med_cls"

  echo -e "$url\t${scores[0]}\t${scores[1]}\t${scores[2]}\t${scores[3]}\t${scores[4]}\t$med_score\t${med_lcp}\t${med_tbt}\t$med_cls" >> ./lighthouse-results/summary.tsv
done

echo ""
echo "════════════════════════════════════════════"
echo "✅ Terminé — Voir ./lighthouse-results/summary.tsv"
echo "════════════════════════════════════════════"
column -t -s $'\t' ./lighthouse-results/summary.tsv
