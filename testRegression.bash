# Handy script for comparing the output of the analysis tool before and after changes are made
# Run with 'accept' to update old output

ALL=tests/baseline.all.txt.temp
ALL_NO_CLASSES=tests/baseline.noclass.txt.temp
IMPORTANT=tests/baseline.txt.temp

if [[ "$1" == "accept" ]]; then
    echo "Old baselines will be replaced..."
    ALL=tests/baseline.all.txt
    ALL_NO_CLASSES=tests/baseline.noclass.txt
    IMPORTANT=tests/baseline.txt
fi

echo "tesing with -a"
ts-node index.ts -ac tests/tsconfig.json > "$ALL"
diff tests/baseline.all.txt "$ALL"
echo "tesing with -ae"
ts-node index.ts -aec tests/tsconfig.json > "$ALL_NO_CLASSES"
diff tests/baseline.noclass.txt "$ALL_NO_CLASSES"
echo "tesing with -e"
ts-node index.ts -ec tests/tsconfig.json > "$IMPORTANT"
diff tests/baseline.txt "$IMPORTANT"

rm -f tests/*.temp
