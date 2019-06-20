# Mine repos

REPO_LIST="repo_list.csv"

# Clone repos from REPO_LIST if repos directory doesn't exist
if ! [[ -d "repos" ]]; then
    mkdir repos
    for repo in `cat $REPO_LIST`; do
        name=$(basename "$repo")
        pushd repos
            git clone --depth=1 "$repo"
            pushd "$name"
                yarn install
            popd
        popd
    done
fi


mkdir -p results

tsc

for name in `ls repos`; do
    echo > "results/$name.txt"
    IFS=$'\n'
    for config in `find "$PWD/repos/$name" -name "tsconfig.json" -not -path "*/node_modules/*"`; do
        echo "Mining project $name $config"
        node index.js --config "$config" >> "results/$name.txt"
    done
    unset IFS
done
