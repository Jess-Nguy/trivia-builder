# Initial Prompt
```
# trivia-builder

I need to build a trivia builder app that follows this kind of style of csv import. so that I can launch a local host couch party like trivia night with friends.
First read the files in "/Users/jessnguy/github/trivia-builder/import/Trivia Mix - June 2 2026.csv" to understand the style of data I need to view
Then read "Generic Scope local template document.docx" and make a scope document similar to it. There's no 2nd person review need.
Then look at the wireframes to understand the UI.
Afterwards build be a simple project timeline plan that an ai agent mode can follow along easily to build a simple web trivia build and play mode as I'll be building this app almost sololy with ai.

## In scope feautres

1. no database. only csv that either get overwritten or a new csv gets created.
2. csv has question, option 1, option 2, option 3, option 4, option 5, current answer, categories, type, attachments, points, hint 1 (future may allow multiple hint columns)
    - Required fields are: `Question`, `Current Answer`, `Type`, and `Points`
    - `Current Answer` should be an exact match to an option if it's multiple choice or `True or False`
    - each question can have multiple categories.
    - type column can only be: single choice, multiple choice, true or false, or single choice w/ media.
    - all options fields can be empty as long as the `type` isn't `Multiple Choice`.
    - If the type is `True or False`  it doesn't require options to be filled in either because the front end can hardcode those options.
    - If the type is `Single Choice` then all option columns can be empty. Only requires `Current Answer` to be filled in.
    - If the type is `Single Choice w/ Media` then treat it like `Single Choice` but with a media import image or short video (1 minute max) or short audio (1 minute max) option
3. single user controls. No storage of scoreboard.
4. Game mode has these settings:
    - user input box of type number for number of teams/users with a min of 1 and a max of 8
    - user input dropdown of available files to select csv questions file under `/import` folder structure
    - user input box of type number for number questions. default number is set to 1. Minimum number of questions is 1. Max number of questions is the max total # of questions in the csv file selected above. This fields will be disabled and uninteractable until "select csv questions" is selected.
    - user input box of type number for question timer min/default of 0 meaning no timer at all. Max of 5mins (300secs)
    - user input box of checkbox for "record points" that will enable the record points tracker during "manual scoreboard" page
    - user input box of checkbox for "record how many hints taken" that will enable the recording of hints during "manual scoreboard" page. If both "record points" & "record how many hints taken" are not checked (disabled) then "manual scoreboard" page is skipped after each question.
    - user input box of checkbox for "hints subtracts points" that will enable subtraction during "final score" page
5. Game play, question page
    - move to next question by keybinding button or mouse click on submit button somewhere.
    - each option is assigned a number for quick keybind fill in. The order of the options can be randomize during Multiple choice type questions only.
    - the page will show the categories the question belongs to
    - a hint button will appear if the hint value is not empty
6. Manual scoreboard page appears after every question to assign/award points to people.
7. Final Score page will be a table view of all the users with tallied points, number of hints taken, and the total score. It will also say the winner given the highest total score. The next button takes user back to the `Game Mode` page.

## Out of scope features

1. each question is to allow questions to have more than 1 hint.
2. points and hint subtraction can be dynamic.
3. add "multiple choice media" as a question type.
4. multi user. this is a single user app. I won't need auth or login because this for me to use personally.
5. there should be a view/page to see all the questions.
6. playlist page will let you build your play mode and select existing imported questions in that playlist or manually make new ones
7. manually making new ones in the playlist selection will be added to the all question view too.
8. play mode will read from a playlist of questions.
```

# Additional Prompts for more features:

## Expanding Attachments and cleaning up question types
```
First read `import/Official JUNE 5th - 213q - Trivia Mix w_ hints.csv` to find the column header has changed against the code. Note that `Attachments` was changed to `Question Attachements`, 5 new columns were added `Option 1 Attachment`, `Option 2 Attachment`, `Option 3 Attachment`, `Option 4 Attachment`, and `Option 5 Attachment`

I need you to add a new feature and update the existing feature. I've refactored the types of questions to only be `Single Choice`, `Multiple Choice` and `True or False` because if there's an attachment for the question then it should just grab it and add it no matter the type of question it is. There for `Single Choice w/ Media` was removed. This means that this is a `multiple choice`  and `true and false` questions now should have the ability to add attachments to it's questions.

Another feature needs to added to use `Option 1 Attachment`, `Option 2 Attachment`, `Option 3 Attachment`, `Option 4 Attachment`, and `Option 5 Attachment` which is, when there's a value in there each option, given it's a `true or false` or `multiple choice` question that it should add the attachment near the options to give visuals. They do not need to have the correspondent option # filled in to make it work. as long as `Option #` and/or `Option # Attachment` is fille that makes a valid question.
```

# Notes:
## Additional features for in scope

1. early exit button to end the game prematurely during any point of the game play. APPLED.
2. to announce if the answer selected was wrong or not in the answer yellow page. if it was wrong and not hints were taken then skip the manual scoreboard page because no one gets points and no one needs to get subtractions/add a counter for hints. if it's wrong but a hint was used then still go to manual scoreboard but no points should be allotted to be distributed. APPLIED.