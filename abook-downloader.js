"use strict";

(async function () {
	let fs = require("fs");
	let readline = require("readline");
	let crypto = require("crypto");
	let util = require("util");
	let progress = require("progress");
	let request = require("request");
	let stringWidth = require("string-width");
	let performanceNow = require("performance-now");
	let promisify = function (f, self, args) {
		args = Array.from(args);
		return new Promise(function (resolve, reject) {
			let existCallback = false;
			for (let i = 0; i < args.length; i++) {
				if (args[i] === promisify.callback) {
					existCallback = true;
					args[i] = function () {
						resolve(arguments);
					};
				}
			}
			if (!existCallback) {
				args.push(function () {
					resolve(arguments);
				});
			}
			try {
				f.apply(self, args);
			} catch (e) {
				reject(e);
			}
		});
	};
	let input = function (prompt) {
		process.stdout.write(prompt);
		return new Promise(function (resolve) {
			let rlInterface = readline.createInterface({
				input: process.stdin
			});
			rlInterface.on("line", function (str) {
				rlInterface.close();
				resolve(str);
			});
		});
	};
	Object.defineProperty(Array.prototype, "len", {
		get: function () {
			return this.length;
		}
	});
	Object.defineProperty(arguments.__proto__, "len", {
		get: function () {
			return this.length;
		}
	});
	Object.defineProperty(Array.prototype, "last", {
		get: function () {
			return this[this.length - 1];
		}
	});
	let range = function range(start = 0, stop, step = 1) {
		if (arguments.len == 1) {
			stop = start;
			start = 0;
		}
		return {
			[Symbol.iterator]() {
				let current = start;
				return {
					next: function () {
						let ret;
						if (current < stop) {
							ret = {
								value: current,
								done: false
							}
						} else {
							ret = {
								value: undefined,
								done: true
							}
						}
						current += step;
						return ret;
					}
				};
			}
		};
	};
	let print = function (...args) {
		let temp;
		for (let i in args) {
			temp = args[i];
			if (temp instanceof Buffer) {
				let binary = false;
				for (let i of temp) {
					if (i > 127) {
						binary = true;
						break;
					}
				}
				if (binary) {
					temp = temp.toString("hex");
				} else {
					temp = temp.toString();
				}
				temp = "Buffer[" + temp + "]"
			}
			if (typeof (temp) === "string" || typeof (temp) === "number" || (temp instanceof Number) || (temp instanceof String)) {
				temp = temp.toString();
			} else {
				try {
					temp = JSON.stringify(temp, null, 4);
				} catch (e) {
					temp = temp.toString();
				}
			}
			args[i] = temp;
		}
		console.log.apply(console, args);
	};
	let sleep = function (n) {
		return new Promise(function (resolve) {
			setTimeout(resolve, n);
		});
	};
	String.prototype.format = function (...args) {
		args.unshift(String(this));
		return util.format.apply(util, args);
	};
	let base64 = function (n) {
		return Buffer.from(n).toString("base64");
	};
	let debase64 = function (n) {
		return Buffer.from(n, "base64").toString();
	};
	let alginFloat = function (n, after) {
		return Math.round(n * (10 ** after)) / (10 ** after);
	};
	let alginNumber = function (n, before, after) {
		n = String(alginFloat(n, after)).split(".");
		while (n[0].len < before) {
			n[0] = " " + n[0];
		}
		if (after === 0) {
			return n[0];
		}
		if (n.len === 1) {
			n[1] = "0";
		}
		while (n[1].len < after) {
			n[1] += "0";
		}
		return n.join(".");
	};
	let alginString = function (n, length, rightAlgin = false, truncateFromLeft = false) {
		let truncated = false
		while (stringWidth(n) > length) {
			truncated = true;
			if (truncateFromLeft) {
				n = n.slice(1);
			} else {
				n = n.slice(0, -1);
			}
		}
		if (truncated) {
			rightAlgin = truncateFromLeft;
		}
		while (stringWidth(n) < length) {
			if (rightAlgin) {
				n = " " + n;
			} else {
				n = n + " ";
			}
		}
		return n;
	};
	let Pending = class Pending {
		constructor(n = 1) {
			let self = this;
			this.counter = n;
			let resolve;
			this.promise = new Promise(function (r) {
				resolve = r;
			});
			self.promise.resolve = resolve;
			if (n <= 0) {
				resolve();
			}
		};
		resolve(n = 1) {
			this.counter -= n;
			if (this.counter <= 0) {
				this.promise.resolve();
			}
		};
		resolveAll(value) {
			self.promise.resolve(value);
		};
	};
	let Session = function (session, maxConnection = 64) {
		let queue = [], connection = 0;
		let ret = async function (url, options = {}) {
			if (connection > maxConnection) {
				queue.push(new Pending());
				await queue.last.promise;
			}
			if (!options.timeout) {
				options.timeout = 5000;
			}
			options.time = true;
			if (!options.stream) {
				connection++;
				let result = await promisify(session, this, [url, options]);
				connection--;
				if (queue.length) {
					queue.shift().resolve();
				}
				if (result[0]) {
					return [result[0], undefined];
				}
				if (result[1].statusCode >= 400) {
					let error = new Error("HTTP(S) request error " + result[1].statusCode + ": " + result[1].statusMessage);
					error.statusMessage = result[1].statusMessage;
					error.statusCode = result[1].statusCode;
					error.response = result[1];
					error.body = result[2];
					return [error, undefined];
				}
				if (options.parseJSON) {
					try {
						result[2] = JSON.parse(result[2]);
					} catch (e) {
						return [e, undefined];
					}
				}
				return [false, result[2]];
			} else {
				let origConnection = connection;
				try {
					connection++;
					let stream = session(url, options);
					stream.on("close", function () {
						connection--;
					});
					return [false, stream];
				} catch (e) {
					connection = origConnection;
					return [e, undefined];
				}
			}
		};
		return ret;
	};
	Math.average = function (array) {
		let ret = 0;
		for (let i of array) {
			ret += i;
		}
		return ret / array.len;
	};
	Array.prototype.repeat = function (n) {
		let ret = [];
		for (let i of range(n)) {
			ret = ret.concat(this);
		}
		return ret;
	};

	let validateFilename = function (filename) {
		filename = filename.trim();
		let reservedWords = ["/＼", "/／", ':：', '*﹡', '?？', '"”', '<﹤', '>﹤', "|∣"];
		for (let i of range(reservedWords.len)) {
			filename = filename.replaceAll(reservedWords[i][0], reservedWords[i][1]);
		}
		//		/╱／∕		|∣		\＼		*✱✲✳✽﹡		<﹤〈＜‹		>﹥〉＞›
		return filename;
	};
	let mkdir_p = function (filename) {
		try {
			fs.mkdirSync(filename, {
				recursive: true
			});
		} catch (e) {}
	};
	let defaultRetry = async function (n) {
		let a = 5;
		if (this instanceof Number) {
			a = Number(this);
		}
		if (n === 0 || n % a) {
			print("Retry in 1 seconds.");
			await sleep(1000);
		} else {
			if ((await input("Retry? (Y/n): ")).toLowerCase() === "n") {
				return false;
			}
		}
		return true;
	};
	let json2key_value = function (json) {
		let ret = "", temp;
		for (let i in json) {
			temp = json[i];
			if (temp instanceof Buffer) {
				let binary = false;
				for (let i of temp) {
					if (i > 127) {
						binary = true;
						break;
					}
				}
				if (binary) {
					temp = temp.toString("base64");
				} else {
					temp = temp.toString();
				}
			}
			if (typeof (temp) === "string" || typeof (temp) === "number" || (temp instanceof Number) || (temp instanceof String)) {
				temp = temp.toString();
			} else {
				try {
					temp = JSON.stringify(temp);
				} catch (e) {
					temp = temp.toString();
				}
			}
			ret += encodeURIComponent(i) + "=" + encodeURIComponent(temp) + "&";
		}
		return ret.slice(0, -1);
	};
	let login = async function (session, userName, password) {
		let response = await session("https://abook.hep.com.cn/loginMobile.action", {
			body: json2key_value({
				'device': 'iPhone',
				'loginUser.loginName': userName,
				'loginUser.loginPassword': crypto.createHash("md5").end(password).digest().toString("hex"),
				'packageId': 'com.hep.abook',
				'passType': 'MD5',
				'version': 'v1.182'
			}), headers: {
				"User-Agent": "iPhone",
				"Content-Type": "application/x-www-form-urlencoded"
			},
			method: "post",
			parseJSON: true
		});
		if (response[0]) {
			return response[0];
		}
		try {
			if (response[1][0]["message"] == "successful") {
				return false;
			} else {
				return response[1][0]["message"];
			}
		} catch (e) {
			return e;
		}
	};
	let fetchCourseList = async function (session) {
		let courseList = await session("https://abook.hep.com.cn/selectMyCourseList.action?mobile=true&cur=1", { parseJSON: true });
		if (!courseList[0]) {
			try {
				courseList = courseList[1][0].myMobileCourseList;
				let ret = [];
				for (let i in courseList) {
					ret[i] = [courseList[i].courseInfoId, courseList[i].courseTitle];
					ret[courseList[i].courseInfoId] = [i, courseList[i].courseTitle];
				}
				return [false, ret];
			} catch (e) {
				return [e, undefined];
			}
		}
		return [courseList[0], undefined];
	};
	let parseResourceStructure = function (resourceStructure, courseInfoId) {
		courseInfoId = -0;
		let root = {
			haveMenu: false,
			name: "root",
			pId: -1,
			id: -courseInfoId,
			type: -1
		}, allResources = resourceStructure, allResourcesById = {};
		allResources.push(root);
		for (let i of allResources) {
			i.path = [];
			i.children = [];
			i.childrenById = {};
			i.serializable = {
				name: i.name,
				id: i.id,
				children: []
			};
			allResourcesById[i.id] = i;
			if (i.pId === 0) {
				i.pId = -courseInfoId;
			}
		}
		for (let i of allResources) {
			if (i === root) {
				i.parent = null;
				continue;
			}
			allResourcesById[i.pId].serializable.children.push(i.serializable);
			allResourcesById[i.pId].children.push(i);
			allResourcesById[i.pId].childrenById[i.id] = i;
			i.parent = allResourcesById[i.pId];
			delete i.pId;
		}
		for (let i of allResources) {
			let cur = i;
			while (cur !== root) {
				i.path.unshift(validateFilename(cur.name));
				cur = cur.parent;
			}
		}
		allResourcesById[0] = root;
		return [root, allResources, allResourcesById];
	};
	let fetchResourceStructure = async function (session, courseInfoId) {
		let resourceStructure = await session("https://abook.hep.com.cn/resourceStructure.action?courseInfoId=%s".format(courseInfoId), { parseJSON: true });
		return (resourceStructure[0]) ? ([resourceStructure[0], undefined]) : ([false, parseResourceStructure(resourceStructure[1], courseInfoId)]);
	};
	let getResourceUnitInfo = async function (session, courseInfoId, resourceStructure, downloadLinks, retry = defaultRetry.bind(99999)) {
		let resourceInfoURL = "https://abook.hep.com.cn/courseResourceList.action?courseInfoId=%s&treeId=%s&cur=".format(courseInfoId, resourceStructure.id);
		let pageCount = Infinity, resourceInfo = [], temp;
		for (let cur = 1; cur <= pageCount; cur++) {
			for (let i = 1; [temp = await session(resourceInfoURL + cur, { parseJSON: true }), temp[0]].last; i++) {
				print("Failed to fetch resource information of resource %s.".format(resourceStructure.id));
				if (i >= 20 || !(await retry(i))) {
					return [temp[0], undefined];
				}
			}
			if (temp[1][0].message === debase64("6K+l5YaF5a656K+35Zyo55S16ISR56uv5p+l55yL44CC")) {
				return ["needDesktop", undefined];
				resourceInfo = "needDesktop";
				break;
			}
			if (temp[1][0].message === debase64("6K+l55uu5b2V5LiL5peg5YaF5a6544CC6K+354K55Ye75Y+z5L6n566t5aS05bGV5byA5ZCO5rWP6KeI5LiL5LiA57qn6IqC54K555qE5pyJ5YWz5YaF5a6544CC")) {
				return [];
			}
			if (temp[1][0].message !== debase64("5Yqg6L295oiQ5Yqf")) {
				return [temp[1][0].message, undefined];
				print(temp[1][0].message)
				throw ("TODO"); // TODO
			}
			pageCount = temp[1][0].page.pageCount;
			resourceInfo = resourceInfo.concat(temp[1][0].myMobileResourceList);
		}
		if (resourceInfo === "needDesktop") {
			print("TODO", resourceStructure.serializable);
			throw ("TODO"); // TODO
		} else {
			for (let i of resourceInfo) {
				if (downloadLinks[i.resourceInfoId]) {
					i.resFileUrl = downloadLinks[i.resourceInfoId];
				}
				temp = i.resFileUrl.indexOf(".");
				if (temp !== -1) {
					i.format = i.resFileUrl.slice(temp + 1);
				} else {
					i.format = "";
				}
				i.path = resourceStructure.path;
			}
		}
		return [false, resourceInfo];
	};
	let getResourceInfo = async function (session, courseInfoId, resourceStructure, downloadLinks, log = print, retry = defaultRetry) {
		let ret = [];
		if (resourceStructure.type === 1) {
			let temp = await getResourceUnitInfo(session, courseInfoId, resourceStructure, downloadLinks, retry);
			if (temp[0]) {
				return [temp[0], undefined];
			}
			ret = ret.concat(temp[1]);
		}
		let pending = new Pending(resourceStructure.children.len);
		for (let i of resourceStructure.children) {
			getResourceInfo(session, courseInfoId, i, downloadLinks, retry).then(function (n) {
				if (n[1]) {
					ret = ret.concat(n[1]);
				}
				pending.resolve();
			});
		}
		await pending.promise;
		return [false, ret];
	};
	let getDownloadLinks = async function (session, courseInfoId, log = print, retry = defaultRetry) {
		for (let i = 1, temp; (temp = (await session("https://abook.hep.com.cn/enterCourse.action?courseInfoId=%s&roleGroupId=4&ishaveEdit=0".format(courseInfoId))))[0]; i++) {
			log("Failed to enter course %s.".format(courseInfoId));
			if (!(await retry(i))) {
				return [temp[0], undefined];
			}
		}
		let ret = {}, temp, temp1;
		for (let i = 1; [temp = await session("https://abook.hep.com.cn/AjaxSelectMyResource.action?treeId=0&show=largeIcons&ifUser=resList&cur=1"), temp[0]].last; i++) {
			log("Failed to fetch download links on page 1.");
			if (!(await retry(i))) {
				return [temp[0], undefined];
			}
		}
		for (let i of temp[1].match(/<input type="hidden" id="hid[0-9]+" value=".*"\/>/g)) {
			temp1 = i.indexOf('" value="');
			ret[i.slice(28, temp1)] = i.slice(temp1 + 9, -3);
		}
		let pageCount = Number(temp[1].match(/<input type='hidden' name='page.pageCount' value='[0-9]+/)[0].slice(50)), pending = new Pending(pageCount - 1);
		for (let cur = 2; cur <= pageCount; cur++) {
			setImmediate(async function () {
				for (let i = 1; [temp = await session("https://abook.hep.com.cn/AjaxSelectMyResource.action?treeId=0&show=largeIcons&ifUser=resList&cur=" + cur), temp[0]].last; i++) {
					log("Failed to fetch download links on page %s.".format(cur));
					if (!(await retry(i))) {
						pending.resolveAll(temp[0]);
					}
				}
				for (let i of temp[1].match(/<input type="hidden" id="hid[0-9]+" value=".*"\/>/g)) {
					temp1 = i.indexOf('" value="');
					ret[i.slice(28, temp1)] = i.slice(temp1 + 9, -3);
				}
				pending.resolve();
			});
		}
		if (temp = await pending.promise) {
			return [temp, undefined];
		}
		return [false, ret];
	};
	let getCourseResourceInfo = async function (session, courseInfoId, resourceId, read = input, log = print, retry = defaultRetry) {
		let resourceStructure;
		log("Fetching resource structure.");
		for (let i = 1; resourceStructure = await fetchResourceStructure(session, courseInfoId), resourceStructure[0]; i++) {
			log("Failed to fetched resource structure.");
			if (!(await retry(i))) {
				return [resourceStructure[0], undefined];
			}
		}
		resourceStructure = resourceStructure[1];
		log("Successfully fetched resource structure.");
		log("Fetching download links.");
		let downloadLinks = await getDownloadLinks(session, courseInfoId);
		if (downloadLinks[0]) {
			print("Failed to fetch download links.");
			return [downloadLinks[0], undefined];
		}
		downloadLinks = downloadLinks[1];
		log("Successfully fetched download links.");
		log("Resource structure of cource %s:".format(courseInfoId));
		log(resourceStructure[0].serializable);
		while (!resourceStructure[2][resourceId]) {
			resourceId = await read("The ID of the resource / resource tree to download, or R to return: ");
			if (resourceId.toLowerCase() === "r") {
				return [new Error("Canceled by user"), undefined];
			}
			resourceId = parseInt(resourceId);
			if (resourceStructure[2][resourceId]) {
				break
			}
			print("Invalid input.");
		}
		log("Fetching resource information.");
		let resourceInfo = await getResourceInfo(session, courseInfoId, resourceStructure[2][resourceId], downloadLinks);
		if (resourceInfo[0]) {
			print("Failed to fetch resource information.");
			return [resourceInfo[0], undefined];
		}
		log("Successfully fetched resource information.");
		return [false, resourceInfo[1]];
	};
	let getDownloadCommand = function (resourceInfoList, pathBase) {
		let ret1 = "", ret2 = "", dirs = {};
		for (let resourceInfo of resourceInfoList) {
			let path = pathBase.concat(resourceInfo.path);
			dirs[path.join("/")] = true;
			path = path.concat([validateFilename(resourceInfo.resTitle + "." + resourceInfo.format)]);
			ret1 += ("curl '" + "https://abook.hep.com.cn/ICourseFiles/" + resourceInfo.resFileUrl + "' -o '" + path.join("/") + "'") + "\n";
		}
		for (let i in dirs) {
			ret2 += "mkdir -p '" + i + "'\n";
		}
		return ret2 + ret1;
	};
	let downloadWithProgressBar = function (requestStream, output, text = "Downloading", width = 50) {
		return new Promise(function (resolve) {
			let bar = new progress(text + "[:bar] :_percentage :_speed", {
				complete: "=",
				incomplete: " ",
				width: width,
				total: 10000,
				head: ">"
			});
			let time, received = 0, currentReceived = 0, recentSpeed = [];
			requestStream.pipe(output);
			requestStream.on("data", function (data) {
				currentReceived += data.length;
			});
			let updateBar = function (speed, percentage) {
				let speedText;
				if (speed >= 1000 ** 5) {
					speed = 1000 ** 4 * 999.99499999;
				}
				if (speed < 0) {
					speed = 0;
				}
				if (alginFloat(speed / 1000 / 1000 / 1000 / 1000, 2) < 1) {
					if (alginFloat(speed / 1000 / 1000 / 1000, 2) < 1) {
						if (alginFloat(speed / 1000 / 1000, 2) < 1) {
							if (alginFloat(speed / 1000, 2) < 1) {
								speedText = alginNumber(speed, 3, 2) + "  B/s";
							} else {
								speedText = alginNumber(speed / 1000, 3, 2) + " KB/s";
							}
						} else {
							speedText = alginNumber(speed / 1000 / 1000, 3, 2) + " MB/s";
						}
					} else {
						speedText = alginNumber(speed / 1000 / 1000 / 1000, 3, 2) + " GB/s";
					}
				} else {
					speedText = alginNumber(speed / 1000 / 1000 / 1000 / 1000, 3, 2) + " TB/s";
				}
				bar.update(percentage, {
					_speed: speedText,
					_percentage: alginNumber(percentage * 100, 3, 2) + " %"
				});
			};
			updateBar(0, 0);
			let intervalId = setInterval(function () {
				if (requestStream.response) {
					if (!time) {
						time = requestStream.startTime + requestStream.timings.response;
					}
					let now = performanceNow();
					let deltaLength = currentReceived - received;
					let deltaTime = now - time;
					let speed = deltaLength / deltaTime * 1000;
					let length = requestStream.response.headers["content-length"];
					if (!length) {
						length = requestStream.response.headers["x-transfer-length"];
					}
					let percentage = currentReceived / length;
					received = currentReceived;
					time = now;
					recentSpeed.push(speed);
					if (recentSpeed.length > 10) {
						recentSpeed.shift();
					}
					updateBar(Math.average(recentSpeed), percentage * 0.9999499999);
				}
			}, 100);
			requestStream.on("response", function () {
				if (!time) {
					time = requestStream.timings.response + requestStream.startTimeNow;
				}
			});
			requestStream.on("end", function () {
				clearInterval(intervalId);
				bar.chars.head="=";
				updateBar(currentReceived / (performanceNow() - requestStream.startTimeNow - requestStream.timings.response) * 1000, 1);
				resolve(false);
			});
			requestStream.on("error", function (error) {
				updateBar = function () {};
				bar.terminate();
				clearInterval(intervalId);
				output.destroy();
				requestStream.destroy();
				resolve(error);
			});
		});
	};
	let downloadResource = async function (session, resourceInfoList, pathBase, retry = defaultRetry) {
		for (let resourceInfo of resourceInfoList) {
			let path = pathBase.concat(resourceInfo.path);
			mkdir_p(path.join("/"));
			path = path.concat([validateFilename(resourceInfo.resTitle + "." + resourceInfo.format)]);
			for (let i of range(Infinity)) {
				let __SAMELINE = false;
				if (!__SAMELINE) {
					print("Downloading " + path.join("/") + " .");
				}
				let error;
				try {
					error = await downloadWithProgressBar((await session("https://abook.hep.com.cn/ICourseFiles/" + resourceInfo.resFileUrl, {
						stream: true
					}))[1], fs.createWriteStream(path.join("/")), (__SAMELINE) ? (alginString(path.join("/"), 60, false, true) + " ") : (""), (__SAMELINE) ? (35) : (65));
				} catch (e) {
					error = e;
				}
				if (error) {
					print("Failed to download " + path.join("/") + " .");
					if (await retry(i)) {
						continue;
					}
				}
				break;
			}
		}
	};

	(async function main() {
		let session = Session(request.defaults({
			jar: request.jar(),
			forever: true
		}));
		while (true) {
			let userName = await input("Username: ");
			let password = await input("Password: ");
			print("login().");
			if (!await login(session, userName, password)) {
				print("login() succeeded.");
				break;
			}
			print("login() failed.");
		}
		let courseList;
		let printCoursesList = function (courseList) {
			print("There are %s course(s) available:".format(courseList.len));
			for (let i of range(courseList.len)) {
				print(i, courseList[i][0], courseList[i][1]);
			}
		};
		while (true) {
			while (true) {
				print("Fetching course list.");
				courseList = await fetchCourseList(session);
				if (courseList[0]) {
					print("Failed to fetched course list. Retry in 1 second.");
					await sleep(1000);
				} else {
					courseList = courseList[1];
					print("Successfully fetched course list.");
					break;
				}
			}
			printCoursesList(courseList);
			while (true) {
				let choice = (await input("Course number / ID, or R to reload, A to download all, Q to quit: ")).toLowerCase();
				if (choice === "a") {
					let allResourceInfo = [];
					for (let i of range(courseList.len)) {
						print("Preparing resource information of course %s.".format(courseList[i][0]));
						let resourceInfo = await getCourseResourceInfo(session, courseList[i][0], 0);
						if (resourceInfo[0]) {
							break;
						}
						allResourceInfo.push([resourceInfo[1], ["downloads", validateFilename(courseList[i][1])]]);
					}
					if ((await input("Download manually? (y/N): ")).toLowerCase() === "y") {
						print("Use the following command to download:");
						for (let i of allResourceInfo) {
							print(getDownloadCommand(i[0], i[1]));
						}
					} else {
						for (let i of allResourceInfo) {
						await downloadResource(session, i[0], i[1]);
						}
					}
					printCoursesList(courseList);
					continue;
				}
				if (choice === "r") {
					break;
				}
				if (choice === "q") {
					return;
				}
				choice = parseInt(choice);
				if (choice < courseList.len && choice >= 0) {
					choice = courseList[choice][0];
				}
				if (courseList[choice]) {
					let resourceInfo = await getCourseResourceInfo(session, choice);
					if (!resourceInfo[0]) {
						if ((await input("Download manually? (y/N): ")).toLowerCase() === "y") {
							print("Use the following command to download:");
							print(getDownloadCommand(resourceInfo[1], ["downloads", validateFilename(courseList[choice][1])]));
						} else {
							await downloadResource(session, resourceInfo[1], ["downloads", validateFilename(courseList[choice][1])]);
						}
						printCoursesList(courseList);
					}
					continue;
				}
				print("Invalid input.");
			}
		}
	})();
})();
