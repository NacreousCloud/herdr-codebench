-- Herdr Open: macOS hands it the files to open (Finder, `open`, a Cmd+click on
-- a path in a Herdr terminal); open.sh sends them to Herdr's editor.
on open theItems
	set args to ""
	repeat with f in theItems
		set args to args & " " & quoted form of POSIX path of f
	end repeat
	do shell script quoted form of (POSIX path of (path to me) & "Contents/Resources/open.sh") & args
end open

-- A file:// URL (some apps open links this way).
on open location theURL
	do shell script quoted form of (POSIX path of (path to me) & "Contents/Resources/open.sh") & " --url " & quoted form of theURL
end open location

-- Started with no file: nothing to do, and no dialog in the way.
on run
	do shell script "echo \"$(date '+%F %T') run (no file)\" >> \"$HOME/.config/herdr-app/herdr-open.log\""
end run
