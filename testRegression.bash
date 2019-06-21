# Handy script for comparing the output of the analysis tool before and after changes are made
# Run with 'accept' to update old output

ALL=tests/baseline.all.txt.temp
IMPORTANT=tests/baseline.txt.temp

if [[ "$1" -eq "accept" ]]; then
    echo "Old baselines will be replaced..."
    ALL=tests/baseline.all.txt
    IMPORTANT=tests/baseline.txt
fi

echo "tesing with -a"
ts-node index.ts -ac tests/tsconfig.json > "$ALL"
diff tests/baseline.all.txt "$ALL"
echo "tesing without -a"
ts-node index.ts -c tests/tsconfig.json > "$IMPORTANT"
diff tests/baseline.txt "$IMPORTANT"

rm -f tests/*.temp
