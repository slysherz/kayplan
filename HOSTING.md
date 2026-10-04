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

## 5. Links for other people

A link carries the repository and a token, so the other person only has to open it once: their browser keeps what it carries, and the token disappears from the address.

1. Make a token for that person on GitHub, as in step 3, with a name that says whose it is:
   - another trainer: Contents **Read and write**;
   - the athletes: Contents **Read-only**.
2. Open the page, click the repository's name at the top right, and under "Link for another person" paste that token. For the athletes tick "Read only" and, if you want, choose their plan. Copy the link and send it.

What each link gives:

| Link | Opens | Can change the plan |
|---|---|---|
| a read-and-write token | the whole page | yes; the saves show as yours on GitHub |
| a read-only token, "Read only" ticked | the day page: the sessions of one day, on any screen | no |

- **A link is a password.** Anyone who gets it can do what its token can. Send it privately. To take access away, delete that token on GitHub; that is why each person or group gets their own.
- **A read-only token reads the whole private repository**, not only one plan: every plan, past and future sessions, and the course documents in `docs/`. Choosing a plan only limits what the page shows. Do not put in the repository anything the athletes should not be able to read.
- **Always tick "Read only" for a read-only token.** Without it the page shows the editing page, and every save fails.

## What to know

- **Every save is a commit** in `kayplan-rioneiva-2027`, so the plan's whole history is on GitHub.
- **Changes from another device** appear within about 20 seconds. If two devices change the same file at the same moment, the second is told that the plan changed and shows the newer text.
- **The token is kept in the browser.** Anyone who can open that browser can change the plan. If a device is lost, delete the token on GitHub and make a new one.
- **This computer.** `node serve.js` still works on the files here, but those files are now a copy: run `git pull` before using it and commit and push afterwards, or use the page on GitHub here too. The same goes for changes made with Claude in this folder.
- **Athletes' names** must never go into either repository. `bash tools/check-names.sh` checks this folder before a push.
