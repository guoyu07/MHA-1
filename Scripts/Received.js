﻿/* global ImportedStrings */

/// <reference path="Table.js" />
/// <reference path="Strings.js" />
/// <reference path="Headers.js" />
/// <reference path="jquery-2.1.0.min.js" />

var ReceivedRow = function () {
};

ReceivedRow.prototype.hop = 0;
ReceivedRow.prototype.from = "";
ReceivedRow.prototype.by = "";
ReceivedRow.prototype.with = "";
ReceivedRow.prototype.id = 0;
ReceivedRow.prototype.for = "";
ReceivedRow.prototype.via = "";
ReceivedRow.prototype.date = "";
ReceivedRow.prototype.dateNum = 0;
ReceivedRow.prototype.dateSort = 0;
ReceivedRow.prototype.delay = 0;
ReceivedRow.prototype.delaySort = 0;
ReceivedRow.prototype.percent = 0;
ReceivedRow.prototype.sourceHeader = 0;

var Received = function () {
    this.receivedRows = [];
};

Received.prototype.tableName = "receivedHeaders";
Received.prototype.receivedRows = [];
Received.prototype.sortColumn = "hop";
Received.prototype.sortOrder = 1;

Received.prototype.exists = function () {
    return this.receivedRows.length > 0;
};

Received.prototype.doSort = function (col) {
    var that = this;
    if (this.sortColumn === col) {
        this.sortOrder *= -1;
    } else {
        this.sortColumn = col;
        this.sortOrder = 1;
    }

    if (this.sortColumn + "Sort" in this.receivedRows[0]) {
        col = col + "Sort";
    }

    this.receivedRows.sort(function (a, b) {
        return that.sortOrder * (a[col] < b[col] ? -1 : 1);
    });
};

function RemoveEntry(stringArray, entry) {
    var i = stringArray.indexOf(entry);
    if (i >= 0) {
        stringArray.splice(i, 1);
    }

    return stringArray;
}

// Builds array of values for each header in receivedHeaderNames.
// This algorithm should work regardless of the order of the headers, given:
//  - The date, if present, is always at the end, separated by a ";".
// Values not attached to a header will not be reflected in output.
Received.prototype.init = function (receivedHeader) {
    var receivedHeaderNames = ["from", "by", "with", "id", "for", "via"];

    var row = new ReceivedRow();

    // Build array of header locations
    var headerMatches = [];

    row.sourceHeader = receivedHeader;

    // Read out the date first, then clear it from the string
    var iDate = receivedHeader.lastIndexOf(";");
    if (iDate !== -1) {
        row.date = receivedHeader.substring(iDate + 1);
        receivedHeader = receivedHeader.substring(0, iDate);
    }

    // Scan for malformed postFix headers
    // Received: by example.com (Postfix, from userid 1001)
    //   id 1234ABCD; Thu, 21 Aug 2014 12:12:48 +0200 (CEST)
    var postFix = receivedHeader.match(/(.*)by (.*? \(Postfix, from userid .*?\))(.*)/);
    if (postFix) {
        row["by"] = postFix[2];
        receivedHeader = postFix[1] + postFix[3];
        receivedHeaderNames = RemoveEntry(receivedHeaderNames, "by");
    }

    // Scan for malformed qmail headers
    // Received: (qmail 10876 invoked from network); 24 Aug 2014 16:13:38 -0000
    postFix = receivedHeader.match(/(.*)\((qmail .*? invoked from .*?)\)(.*)/);
    if (postFix) {
        row["by"] = postFix[2];
        receivedHeader = postFix[1] + postFix[3];
        receivedHeaderNames = RemoveEntry(receivedHeaderNames, "by");
    }

    // Split up the string now so we can look for our headers
    var tokens = receivedHeader.split(/\s+/);

    var iMatch = 0;
    var iHeader;
    var iToken;

    for (iHeader = 0; iHeader < receivedHeaderNames.length; iHeader++) {
        row[receivedHeaderNames[iHeader]] = "";
        for (iToken = 0; iToken < tokens.length; iToken++) {
            if (receivedHeaderNames[iHeader] === tokens[iToken]) {
                headerMatches[iMatch++] = [iHeader, iToken];
            }
        }
    }

    // Next bit assumes headerMatches[x,y] is increasing on y.
    // Sort it so it is.
    headerMatches.sort(function (a, b) {
        return a[1] - b[1];
    });

    for (iMatch = 0; iMatch < headerMatches.length; iMatch++) {
        iHeader = headerMatches[iMatch][0];
        var iTokenHeader = headerMatches[iMatch][1];
        var iFirstVal = iTokenHeader + 1;

        var iNextTokenHeader;
        var iLastVal;
        if (iMatch + 1 < headerMatches.length) {
            iNextTokenHeader = headerMatches[iMatch + 1][1];
        } else {
            iNextTokenHeader = tokens.length;
        }
        iLastVal = iNextTokenHeader - 1;

        var headerName = receivedHeaderNames[iHeader];
        if (row[headerName] !== "") { row[headerName] += "; "; }
        for (iToken = iFirstVal; iToken <= iLastVal; iToken++) {
            row[headerName] += tokens[iToken];
            if (iToken < iLastVal) { row[headerName] += " "; }
        }
    }

    row.dateNum = Date.parse(row.date);
    row.date = new Date(row.date).toLocaleString();
    row.dateSort = row.dateNum;
    row.delaySort = -1; // Force the "no previous or current time" rows to sort before the 0 second rows
    row.percent = 0;

    this.receivedRows.push(row);
};

Received.prototype.computeDeltas = function () {
    // Process received headers in reverse order
    this.receivedRows.reverse();

    // Parse rows and compute values needed for the "Delay" column
    var iStartTime = 0;
    var iEndTime = 0;
    var iLastTime = NaN;
    var iDelta = 0; // This will be the sum of our positive deltas
    var i;
    for (i = 0; i < this.receivedRows.length; i++) {
        if (!isNaN(this.receivedRows[i].dateNum)) {
            if (!isNaN(iLastTime) && iLastTime < this.receivedRows[i].dateNum) {
                iDelta += this.receivedRows[i].dateNum - iLastTime;
            }

            iStartTime = iStartTime || this.receivedRows[i].dateNum;
            iEndTime = this.receivedRows[i].dateNum;
            iLastTime = this.receivedRows[i].dateNum;
        }
    }

    iLastTime = NaN;
    var totalTime = "";
    // Total time is still last minus first, even if negative.
    if (iEndTime !== iStartTime) {
        totalTime = this.computeTime(iEndTime, iStartTime);
    }

    for (i = 0; i < this.receivedRows.length; i++) {
        this.receivedRows[i].hop = i + 1;
        this.receivedRows[i].delay = this.computeTime(this.receivedRows[i].dateNum, iLastTime);

        if (!isNaN(this.receivedRows[i].dateNum) && !isNaN(iLastTime) && iDelta !== 0) {
            this.receivedRows[i].delaySort = this.receivedRows[i].dateNum - iLastTime;

            // Only positive delays will get percentage bars. Negative delays will be color coded at render time.
            if (this.receivedRows[i].delaySort > 0) {
                this.receivedRows[i].percent = 100 * this.receivedRows[i].delaySort / iDelta;
            }
        }

        if (!isNaN(this.receivedRows[i].dateNum)) {
            iLastTime = this.receivedRows[i].dateNum;
        }
    }

    return totalTime;
};

// Computes min/sec from the diff of current and last.
// Returns nothing if last or current is NaN.
Received.prototype.computeTime = function (current, last) {
    var time = [];

    if (isNaN(current) || isNaN(last)) { return time; }
    var diff = current - last;
    var iDelay;
    var printedMinutes = false;

    if (diff < 0) {
        time.push(ImportedStrings.mha_negative);
        diff = -diff;
    }

    if (diff >= 1000 * 60) {
        iDelay = Math.floor(diff / 1000 / 60);
        time.push(iDelay, " ");
        if (iDelay === 1) {
            time.push(ImportedStrings.mha_minute);
        } else {
            time.push(ImportedStrings.mha_minutes);
        }

        diff -= iDelay * 1000 * 60;
        printedMinutes = true;
    }

    if (printedMinutes && diff) {
        time.push(" ");
    }

    if (!printedMinutes || diff) {
        iDelay = Math.floor(diff / 1000);
        time.push(iDelay, " ");
        if (iDelay === 1) {
            time.push(ImportedStrings.mha_second);
        } else {
            time.push(ImportedStrings.mha_seconds);
        }
    }

    return time.join("");
};