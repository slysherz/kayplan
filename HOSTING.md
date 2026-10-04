# Kayplan on GitHub: the other computer and the phone

The page is put on GitHub Pages, where any browser can open it. The plan stays in a private repository, and each browser is given a token that lets it read and write that repository. Nothing has to be left running.

Two repositories:

| Repository | Visibility | Holds |
|---|---|---|
| the plan, e.g. `kayplan-rioneiva-2027` | private | this whole folder: the plan in `season/`, the code, the course documents, the history |
| the page, e.g. `kayplan` | public | only the built page (`site/`): no plan, no course documents |


## 1. The private repository

1. On GitHub: New repository, name `kayplan-rioneiva-2027`, **Private**, with no README.
2. In this folder:

```
bash tools/check-names.sh
git remote add origin git@github.com:slysherz/kayplan-rioneiva-2027.git
git push -u origin main
```

## 2. The page

1. On GitHub: New repository, name `kayplan`, **Public**, with no README.
2. In this folder:

```
npm run site
cd site
git init -b main
git add -A
git commit -m "Kayplan page"
git remote add origin git@github.com:slysherz/kayplan.git
git push -u origin main
```

3. On GitHub, in the `kayplan` repository: Settings → Pages → Source "Deploy from a branch", branch `main`, folder `/ (root)`. After a minute the page is at `https://slysherz.github.io/kayplan/`.

To publish a newer version of the page later: `npm run site`, then in `site/`: `git add -A`, `git commit -m "Update"`, `git push`.

## 3. The token

1. On GitHub: your picture → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Repository access: "Only select repositories", and choose `kayplan-rioneiva-2027`.
3. Permissions → Repository permissions → Contents: **Read and write**. Nothing else.
4. Choose when it expires, generate it, and copy it. GitHub shows it only once.

## 4. On each device

Open `https://slysherz.github.io/kayplan/`. The page asks once:

- Repository: `slysherz/kayplan-rioneiva-2027`
- Folder: `season`
- Token: the token

The browser keeps them. The repository's name at the top right of the page opens the form again.

## What to know

- **Every save is a commit** in `kayplan-rioneiva-2027`, so the plan's whole history is on GitHub.
- **Changes from another device** appear within about 20 seconds. If two devices change the same file at the same moment, the second is told that the plan changed and shows the newer text.
- **The token is kept in the browser.** Anyone who can open that browser can change the plan. If a device is lost, delete the token on GitHub and make a new one.
- **This computer.** `node serve.js` still works on the files here, but those files are now a copy: run `git pull` before using it and commit and push afterwards, or use the page on GitHub here too. The same goes for changes made with Claude in this folder.
- **Athletes' names** must never go into either repository. `bash tools/check-names.sh` checks this folder before a push.
