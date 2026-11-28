# Submit your group's agent

Create one fork per coursework group. Your group can run the simulator and change its rules, interface or agents on that fork. Forks of this public repository are public, so other groups can read changes you push. To enter an agent in the shared game, open a pull request containing your group's behaviour. The organiser can then review who changed it, what changed and which version ran.

## Set up your group's fork

1. One member [creates the fork](https://github.com/AhHamedi/somas-garden/fork). In the fork's **Settings → Collaborators**, invite teammates using their own GitHub accounts. If a group owns its fork through an organisation, grant the teammates write access there.
2. Each member clones the same fork. Replace `YOUR-GROUP` below with the fork owner's GitHub name. If you renamed the fork, use its clone URL.

   ```sh
   git clone https://github.com/YOUR-GROUP/somas-garden.git
   cd somas-garden
   git remote add upstream https://github.com/AhHamedi/somas-garden.git
   git fetch upstream
   ```

3. One teammate creates the submission branch with `git switch -c group-3/first-agent upstream/main`. These examples use Group 3. Substitute your assigned number from 1 to 6. Use a fresh branch name for each submission. Once the branch has been pushed, teammates can join it with `git fetch origin` followed by `git switch --track origin/group-3/first-agent`.

## Add your behaviour

Set the display name in `teams/group-3/team.json`, for example `{"name":"Orchard Keepers"}`. Add **one** of the following behaviour files alongside it. A directory containing only `team.json` is an empty slot. You can include a `README.md` in the same directory to explain your strategy.

| File           | What to put in it                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `agent.go`     | A Go source file implementing `func Decide(v View) Action`. Start from the working example below. Its build tag is optional.         |
| `builder.json` | A visual builder object. For example, `{"harvest": 3, "eat": 2, "think": 0, "vote": "abstain"}` asks for three carrots and eats two. |

To start the Go version, run this once before editing your strategy.

```sh
cp public/society-example.go teams/group-3/agent.go
```

The Go source limit is 65,536 bytes. Each individual receives its own observation and private memory. By default the engine allows 100 ms per callback and 1 MiB of JSON memory per individual. The [agent API](../docs/AGENT_API.md) explains the phases, supported actions and use of memory.

## Run your version

Install Node 20.18.1 or later and Go 1.23 or later. Run these commands from the root of your fork.

```sh
npm ci
npm run check:agents
npm run dev
```

Open [the local groups screen](http://127.0.0.1:8787/?groups), select your group and start a world. You can test against built-in teams while other groups are still developing. Use the same seed and settings when you compare revisions.

## Submit the change on GitHub

Commit using your own Git identity. Each member should use an email associated with their GitHub account so the history credits them. Stage just your group's directory, inspect the change, then push to the fork.

```sh
git add teams/group-3
git diff --cached
git commit -m "Group 3: conserve mind during founding votes"
git push -u origin group-3/first-agent
```

Open a pull request with **base** `AhHamedi/somas-garden:main` and **compare** `YOUR-GROUP:group-3/first-agent`. In **Files changed**, check that only `teams/group-3/` has changed. Describe the change and the seed and settings you tested. Push further corrections to the same branch while the PR is open.

### If you also changed the simulator

Keep simulator experiments on a separate branch in your fork. Commit agent changes separately so you can copy those commits, with their authorship, into a submission. To submit an agent already committed on your experiment branch, start a fresh branch from the shared game.

```sh
git fetch upstream
git switch -c group-3/submit-v2 upstream/main
git cherry-pick -x AGENT_COMMIT_SHA
npm run check:agents
git diff --name-only upstream/main...HEAD
git push -u origin group-3/submit-v2
```

Replace `AGENT_COMMIT_SHA` with the agent-only commit from your experiment. For several commits, cherry-pick each in chronological order. Test the branch in the unmodified shared simulator, then open its PR. The original experiment branch retains all its changes. Start each new submission from a freshly fetched `upstream/main` so it includes the latest shared rules and accepted agents.

## Review and run the match

For a pull request from a fork that touches a group slot, the **Group submission scope** check verifies that every changed file belongs to that one group's directory. Forks can also send separate pull requests for shared simulator changes. The organiser checks the submitting fork and authors against the assigned group, reviews the behaviour and waits for the repository checks to pass. Use a merge commit to preserve the original contributor commits. The discussion, review and merge on the PR provide the submission record.

After the merged version is deployed, open [the shared roster](https://somas.sites.moonisolutions.net/?groups). Select the six-group roster when all six have submitted. Open **Results → Behaviour** to inspect the revision saved with the world and follow its GitHub permalink when a release commit is available. Record the release commit, seed and world settings alongside the results so the class can reproduce the match.
