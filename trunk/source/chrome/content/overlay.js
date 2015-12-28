var f2evalidator = {};

(function() {
    var
    
    // mostly used various
    _cc = Components.classes,
    _ci = Components.interfaces,
    _tidy = null,
    _customRules = {},
    _customRules1 = {}, // 临时禁用的规则
    _tidyFilter = {},
    _pageStyles = '\
        #f2evalidator-container {\
            position : fixed;\
            right : 10px;\
            bottom : 10px;\
            border : 0;\
            height : 200px;\
            width : 350px;\
            z-index : 99999;\
            background : #eee;\
        }\
        #f2evalidator-banner {\
            background:#ccc;\
            margin:0;\
            -moz-border-radius:0;\
            height:18px;\
            width:350px;\
            font:12px/1.5 arial;\
            text-align:right;\
        }\
        #f2evalidator-title:link,\
        #f2evalidator-title:visited,\
        #f2evalidator-title:hover,\
        #f2evalidator-title:active {\
            margin:0 235px 0 0;\
            font-weight:bold;\
            text-decoration : none;\
            color : #000;\
        }\
        #f2evalidator-close:link,\
        #f2evalidator-close:visited,\
        #f2evalidator-close:hover,\
        #f2evalidator-close:active {\
            text-decoration : none;\
            color:#000;\
            padding-right : 10px;\
        }\
        #f2evalidator-issues {\
            border:2px solid #999;\
            list-style-type:none;\
            padding:0;\
            margin:0;\
            width:346px;\
            height:178px;\
            overflow-y:scroll;\
            overflow-x:hidden;\
        }\
        #f2evalidator-issues li {\
            margin:0;\
            text-align:left;\
            font:12px/1.5 arial;\
            border:0;\
            padding:0 0 0 5px;\
            color:black;\
            cursor:pointer\
        }\
        #f2evalidator-issues .f2evalidator-single {\
            background:#666;\
            color : #fff;\
        }\
    ',
    
    _showError = function(ex) {
        alert("出问题鸟，顺手提个Bug吧：\r\nhttp://code.google.com/p/f2evalidator/issues/entry\r\n" + ex);
    },
    
    // mozilla xpcom interface
    _mozilla = {
        getConsole : function() {
            return _cc['@mozilla.org/consoleservice;1'].getService(_ci.nsIConsoleService);
        },
        getPrompt : function() {
            return _cc['@mozilla.org/embedcomp/prompt-service;1'].getService(_ci.nsIPromptService);
        },
        getPref : function() {
            return _cc['@mozilla.org/preferences-service;1'].getService(_ci.nsIPrefService);
        },
        getUnicodeConverter : function() {
            return _cc['@mozilla.org/intl/scriptableunicodeconverter'].getService(_ci.nsIScriptableUnicodeConverter);
        },
        getIO : function() {
            return _cc['@mozilla.org/network/io-service;1'].getService(_ci.nsIIOService);
        },   
        createTidy : function() {
            return _cc['@mozilla.org/tidy;1'].createInstance().QueryInterface(_ci.nsITidy);
        },
        createInputStream : function() {
            return _cc['@mozilla.org/scriptableinputstream;1'].createInstance(_ci.nsIScriptableInputStream);
        },
        createScriptError : function() {
            return _cc['@mozilla.org/scripterror;1'].createInstance(_ci.nsIScriptError);
        }
    };
    
    // Class Issue
    // 对应错误消息列表中的一条
    function Issue(message, row, col, type, level) {
        this.message = message || '未定义错误消息';
        this.row = parseInt(row) || 0;
        this.col = parseInt(col) || 0;
        this.type = type || '';
        this.level = parseInt(level) || 5;
    }
    
    Issue.prototype.getHtmlMessage = function() {
        var result = '', 
            message = this.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if(this.row === 0) {
            result = message;
        } else {
            result = '第' + this.row + '行：' + message;
        }
        
        if(this.type) {
            result = result + '(' + this.type + ')';
        }
        
        return result;
    };
    
    Issue.prototype.getData = function() {
        return JSON.stringify({
            "row" : this.row,
            "col" : this.col,
            "type" : this.type,
            "target" : this.target,
            "level" : this.level
        });
    };
    
    // Class IssueCollection
    // 错误消息的集合，对应于所有错误
    function IssueCollection() {
        this.issues = [];
    }
    
    IssueCollection.prototype.add = function(message, row, col, type) {
        var issue = new Issue(message, row, col, type);
        this.issues.unshift(issue);
        return issue;
    }
    IssueCollection.prototype.get = function(index) {
        return this.issues[index];
    }
    IssueCollection.prototype.remove = function(index) {
        this.issues = this.issues.splice(index, 1);
        return this.issues;
    }    
    IssueCollection.prototype.length = function() {
        return this.issues.length;
    }
    IssueCollection.prototype.isEmpty = function() {
        return this.issues.length === 0;
    }
    
    // is array contain a certain element?
    function inArray(arr, value) {
        var i = 0, length = arr.length;
        for (; i < length; i++) if (arr[i] === value) return true;
        return false;
    }
    
    // 初始化tidy，只有在windows加载的时候才会调用
    function initTidy() {
        try {
            _tidy = _mozilla.createTidy();
        } catch(ex) { _showError(ex); }
    }
    
    // 根据地址判断一个页面是否需要处理
    function needValidateByUrl(url) {
        var reTrue = new RegExp(_getCharPref("whitelist"));
        // var reTrue = new RegExp('^http:\/\/|https:\/\/');
        var reFalse = new RegExp(_getCharPref("blacklist"));
        return reTrue.test(url) && !reFalse.test(url);
    }
    
    // 根据标题判断一个页面是否需要处理
    function needValidateByTitle(title) {
        var reTrue = new RegExp('.*');
        var reFalse = new RegExp('^Index of \/|^File Explorer');
        return reTrue.test(title) && !reFalse.test(title);
    }
    
    // 判断一个页面是不是需要进行处理
    function needValidate(doc) {
        return doc instanceof HTMLDocument && 
               doc.URL === doc.defaultView.parent.location.href && 
               needValidateByUrl(doc.location.href.toString()) && 
               needValidateByTitle(doc.title);
    }
    
    // 将tidy的一行错误信息转换为Issue对象
    function createTidyIssue(tidyErrorItem, issues) {
        var matchResult = tidyErrorItem.match(/(\d+)\t(\d+)\t(\d+)\t(\d+)\t(.+)/);
        if(matchResult) {
            var tidyIssue = new Issue(matchResult[5], matchResult[1], matchResult[2], 'TIDY' + matchResult[3]),
                isAdd = true,
                tidyFilterHandler = _tidyFilter[tidyIssue.type];
            
            if(tidyFilterHandler) {
                isAdd = tidyFilterHandler(tidyIssue);
            }  
            
            if(isAdd && tidyIssue.row != "") issues.add(tidyIssue.message, tidyIssue.row, tidyIssue.col, tidyIssue.type);
        }
    }
    
    // 将整个tidy error对象
    function formatTidyError(tidyError) {
        var tidyErrorItems = tidyError.value.split('\r\n'),
            i = 0, length = tidyErrorItems.length,
            issues = new IssueCollection();
        
        for(; i < length; i++) {
            createTidyIssue(tidyErrorItems[i], issues);
        }
        
        return issues;
    }
    
    // 获取tidy校验的错误信息
    function getIssuesInHTML(cacheHtml, doc) {
        var nbError         = { value : 0 },
            nbWarning       = { value : 0 },
            nbAccessWarning = { value : 0 },
            nbHidden        = { value : 0 },
            errorContent    = { value : '---' },
            accessLevel     = '';

        if(_getBoolPref("useTidy")) {
            _tidy.getErrorsInHTML(cacheHtml, '', accessLevel, errorContent, nbError, nbWarning, nbAccessWarning, nbHidden );
        }
        
        return customValidate(cacheHtml, doc, formatTidyError(errorContent));
    }
    
    // 跑一遍所有的自定义校验规则
    function customValidate(html, doc, issues) {
        var customRule;
        for(ruleName in _customRules) {
            _customRules[ruleName](html, doc, issues);
        }
        return issues;
    }
    
    // 获取历史记录？
    function getHistoryEntry(doc) {
        return doc.defaultView
                  .QueryInterface(_ci.nsIInterfaceRequestor)
                  .getInterface(_ci.nsIWebNavigation)
                  .QueryInterface(_ci.nsIWebPageDescriptor)
                  .currentDescriptor
                  .QueryInterface(_ci.nsISHEntry);
    }
    
    // 获取缓存内容？
    function getCacheChannel(url, charset, history) {
        
        var channel = _mozilla.getIO()
                             .newChannel( url, charset, null );
            channel.loadFlags |= _ci.nsIRequest.VALIDATE_NEVER;
            channel.loadFlags |= _ci.nsIRequest.LOAD_FROM_CACHE;
            channel.loadFlags |= _ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE;
            
        var cacheChannel = channel.QueryInterface(_ci.nsICachingChannel);
            cacheChannel.cacheKey = history.cacheKey;
            
        return cacheChannel;
    }
    
    // 从一个频道中读取数据？
    function readChannel(channel) {
        var result = '',
            stream = channel.open(),
            scriptableStream = _mozilla.createInputStream();
            
        scriptableStream.init( stream );
        while( scriptableStream.available() > 0 ) {
            result += scriptableStream.read(scriptableStream.available());
        }
        scriptableStream.close();    
        stream.close();
        
        return result;
    }
    
    // 编码转换
    function convertToUnicode(str, charset) {
        var ucConverter =  _mozilla.getUnicodeConverter();
            ucConverter.charset = charset;
            
        return ucConverter.ConvertToUnicode(str);
    }
    
    // 获取HTML内容
    function getHtmlFromCache(doc) {
        var url = doc.URL,
            charset = doc.characterSet,
            history = getHistoryEntry(doc),
            cacheChannel = getCacheChannel(url, charset, history),
            result = readChannel(cacheChannel),
            convertedResult = convertToUnicode(result, charset);
        
        return convertedResult;
    }
    
    // 用来控制叫错误信息显示到哪里
    function logIssues(issues) {
        logIssuesToDump(issues);
    }
    
    // 输出到windows console
    // firefox.exe -console
    function logIssuesToDump(issues) {
        var i = 0, length = issues.length(),
            now = new Date();
        
        dump('\r\n');
        dump('F2E Validator Log @ ' + now + '\r\n');
        dump('-----------------------------------\r\n');
        for(; i < length; i++) {
            dump(issues.get(i).message + '\r\n');
        }
    }
    
    // 将一段CSS插入到页面中
    function initPageStyles(doc, styles) {
        var styleElement = doc.createElement('style'),
            head = doc.getElementsByTagName('head')[0];
            
        styleElement.setAttribute('id', 'f2evalidator-styles');
        styleElement.innerHTML = styles;
        if(head) {
            head.appendChild(styleElement);
        }
    }
    
    // 将发现的问题输出到页面上
    function logIssuesToPage(issues, doc) {
        var htmlForIssues = '', i = 0, length = issues.length();
        
        for(; i < length; i++) {
            if(i % 2 === 0) {
                htmlForIssues += '<li data=\'' + issues.get(i).getData() + '\'>' + issues.get(i).getHtmlMessage() + '</li>';
            }
            else {
                htmlForIssues += '<li data=\'' + issues.get(i).getData() + '\' class="f2evalidator-single">' + issues.get(i).getHtmlMessage() + '</li>';
            }
        }
        
        var container = doc.createElement('div');
            container.setAttribute('id', 'f2evalidator-container');
            container.innerHTML = '\
                <div id="f2evalidator-banner">\
                    <a id="f2evalidator-title" href="//f2evalidator.com" target="_blank">F2E Validator</a>\
                    <a id="f2evalidator-close" href="#close">关闭</a>\
                </div>\
                <ul id="f2evalidator-issues">' + htmlForIssues + '</ul>';
        doc.body.appendChild(container);
        
        var close = doc.getElementById('f2evalidator-close'),
            list = doc.getElementById('f2evalidator-issues'),
            styles = doc.getElementById('f2evalidator-styles');
            
        close.addEventListener('mousedown', function(ev) {
            ev.preventDefault();
            container.parentNode.removeChild(container);
            styles.parentNode.removeChild(styles);
        }, false);
        
        list.addEventListener('click', function(ev) {
            var target = ev.target;
            if(target.nodeName.toLowerCase() !== "li") {
                return;
            }
            var data = JSON.parse(target.getAttribute("data"));
            if(data.row !== 0) {
                gViewSourceUtils.openInInternalViewer(doc.URL, null, null, data.row);
            }
            else {
                if(data.type && data.target && data.type === "images") {
                    gBrowser.addTab(data.target);
                }
            }
        }, false);
    }
    
    function _getBoolPref(pref) {
        try {
            return _mozilla.getPref()
                          .getBranch("extensions.f2evalidator.")
                          .getBoolPref(pref||"");
        } catch (ex) { _showError(ex); }
    };
    
    function _getRulePref(pref) {
        try {
            return _mozilla.getPref()
                          .getBranch("extensions.f2evalidator.rules.")
                          .getBoolPref(pref||"");
        } catch (ex) { _showError(ex); }
    };
    
    function _getCharPref(pref) {
        try {
            return _mozilla.getPref()
                          .getBranch("extensions.f2evalidator.")
                          .getCharPref(pref||"");
        } catch (ex) { _showError(ex); }        
    };
    
    // --------------------------------------------------------------------------------
    //
    //                                  自定义规则区
    //
    // --------------------------------------------------------------------------------
    
    // 自定义规则：检验doctype的合法性
    _customRules['doctype'] = function(html, doc, issues) {
        if(_getRulePref("doctype") === false) {
            return issues;
        }
        
        var reDoctype = /<\!doctype\s/ig;
        var reHtml5 = /^\s*<\!doctype\s+html>/i;
        var reHtml4s = /^\s*<!doctype\shtml\spublic "-\/\/w3c\/\/dtd html 4\.01\/\/en"\s+"http:\/\/www\.w3\.org\/tr\/html4\/strict\.dtd">/i;
        var reXhtml11s = /^\s*<!doctype\s+html\s+public\s"-\/\/w3c\/\/dtd\sxhtml\s1\.0\sstrict\/\/en"\s+"http:\/\/www\.w3\.org\/tr\/xhtml1\/dtd\/xhtml1-strict\.dtd">/i;
        var reXhtml11t = /^\s*<!doctype\s+html\s+public\s"-\/\/w3c\/\/dtd\sxhtml\s1\.0\stransitional\/\/en"\s+"http:\/\/www\.w3\.org\/tr\/xhtml1\/dtd\/xhtml1-transitional\.dtd">/i
        var reXhtml11f = /^\s*<!doctype\s+html\s+public\s"-\/\/w3c\/\/dtd\sxhtml\s1\.0\sframeset\/\/en"\s+"http:\/\/www\.w3\.org\/tr\/xhtml1\/dtd\/xhtml1-frameset\.dtd">/i;
        
        if(html.match(reDoctype)) {
            if(html.match(reDoctype).length > 1)  issues.add('设置了不止一个doctype');
            else {

                if(reHtml5.test(html) || reHtml4s.test(html) || reXhtml11s.test(html) || reXhtml11t.test(html) || reXhtml11f.test(html)) {
                }
                else {
                    issues.add('设置的doctype格式不正确');
                }                            
            }
        }
        else issues.add('没有设置doctype');
        return issues;
    };
    
    _customRules['noya'] = function(html, doc, issues) {
        var reRule = /data.cn.yahoo.com\/dpjs\/koubei\.js/ig;
        
        if(html.match(reRule)) {
            issues.add('发现了雅虎noya的埋点，应该去除');
        }
        
        return issues;
    };
    
    _customRules['linezing'] = function(html, doc, issues) {
        var reRule = /http:\/\/js\.tongji\.linezing\.com/ig;
        
        if(html.match(reRule)) {
            issues.add('发现了雅虎量子的埋点，应该去除');
        }
        
        return issues;
    };
    
    _customRules['ykclickheat'] = function(html, doc, issues) {
        var reRule = /ykclickheat/ig;
        
        if(html.match(reRule)) {
            issues.add('发现了页面点击热图的埋点，应该去除');
        }
        
        return issues;
    };
    
    _customRules['koubeiaddjs'] = function(html, doc, issues) {
        var reRule = /TraceRoutine\/KoubeiAddJS\.php/ig;
        
        if(html.match(reRule)) {
            issues.add('发现了http://ap.koubei.com/TraceRoutine/KoubeiAddJS.php，应该去除');
        }
        
        return issues;
    };
    
    _customRules['images'] = function(html, doc, issues) {
        if(_getRulePref("image") === false) {
            return issues;
        }
        
        var docImages = doc.images, i = 0, length = docImages.length, issue = null,
            docImage = null, docImageHeight = 0, docImageWidth = 0,
            objImage = null, objImageHeight = 0, objImageWidth = 0,
            imageHeight = null, imageWidth = null;
            
        for (; i < length; i++) {
            docImage = docImages[i];
            docImageHeight = docImage.height;
            docImageWidth = docImage.width;
            imageHeight = docImage.getAttribute("height");
            imageWidth = docImage.getAttribute("width");
            
            if (0 === docImageWidth || 0 === docImageHeight)
                continue;
                
            if(/atpanel/.test(docImage.src))
                continue;

            if(!!docImage.src) {
            
                if(imageWidth !== null && imageHeight !== null) {
                }
                else if(imageWidth !== null) {
                    issue = issues.add('图片' + docImage.src + ' 没有设置width');
                    issue.target = docImage.src;
                    issue.type = 'images';
                }
                else if(imageHeight !== null) {
                    issue = issues.add('图片' + docImage.src + ' 没有设置height');
                    issue.target = docImage.src;
                    issue.type = 'images';
                }
                else {
                    issue = issues.add('图片' + docImage.src + ' 没有设置width和height');
                    issue.target = docImage.src;
                    issue.type = 'images';
                }
            
                objImage = new Image();
                objImage.src = docImage.src;
                objImageHeight = objImage.height;
                objImageWidth = objImage.width;

                if (objImageWidth !== docImageWidth || objImageHeight !== docImageHeight) {
                    issue = issues.add('图片' + docImage.src + '   压缩尺寸：' + docImageWidth + 'x' + docImageHeight + '     实际尺寸：' + objImageWidth + 'x' + objImageHeight);
                    issue.target = docImage.src;
                    issue.type = 'images';
                }
            }
            else {
                issues.add('当前页面某个图像没有设置src属性');
            }

        }

        return issues;
    }
    
    // --------------------------------------------------------------------------------
    //
    //                                  Tidy规则处理区域
    //
    // --------------------------------------------------------------------------------
    
    _tidyFilter["TIDY1"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY2"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY3"] = function(issue) {
        // unescaped & or unknown entity "&cm_id"
        return false;
    };
    
    _tidyFilter["TIDY4"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY5"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY6"] = function(issue) {
        // missing </div>
        var matchResult = issue.message.match(/^missing\s(.+)$/);
        if(matchResult) {
            issue.message = "元素未结束" + matchResult[1];
        }
        return true;
    };
    
    _tidyFilter["TIDY7"] = function(issue) {
        // missing </ul> before </div>
        var matchResult = issue.message.match(/^missing\s(.+)\sbefore\s(.+)$/);
        if(matchResult) {
            issue.message = "在" + matchResult[2] + "前面缺少" + matchResult[1] + "元素";
        }
        return true;
    };
    
    _tidyFilter["TIDY8"] = function(issue) {
        // discarding unexpected </input>
        var matchResult = issue.message.match(/^discarding\sunexpected\s(.+)$/);
        if(matchResult) {
            issue.message = matchResult[1] + "在这里是多余的";
        }
        return true;
    };
    
    _tidyFilter["TIDY9"] = function(issue) {
        // nested emphasis <b>
        var matchResult = issue.message.match(/^nested\semphasis\s(.+)$/);
        if(matchResult) {
            issue.message = "警告，发现了嵌套的" + matchResult[1] + "元素";
        }
        return false;
    };
    
    _tidyFilter["TIDY10"] = function(issue) {
        // replacing unexpected span by </span>
        var matchResult = issue.message.match(/^replacing\sunexpected\s(.+)\sby\s(.+)$/);
        if(matchResult) {
            issue.message = matchResult[1] + "元素不能放在这里，请检查";
        }
        return true;
    };
    
    _tidyFilter["TIDY11"] = function(issue) {
        // <style> isn't allowed in <div> elements
        var matchResult = issue.message.match(/^(.+)\sisn't\sallowed\sin\s(.+)\selements$/);
        if(matchResult) {
            issue.message = matchResult[1] + "元素不允许出现在" + matchResult[2] + "元素中";
        }
        return true;
    };
    
    _tidyFilter["TIDY12"] = function(issue) {
        // missing <li>
        var matchResult = issue.message.match(/^missing\s(.+)$/);
        if(matchResult) {
            issue.message = "错误，缺少" + matchResult[1] + "元素";
        }
        return true;
    };
    
    _tidyFilter["TIDY13"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY14"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY15"] = function(issue) {
        // inserting implicit <span>
        var matchResult = issue.message.match(/^inserting\simplicit\s(.+)$/);
        if(matchResult) {
            issue.message = "警告，可能需要插入" + matchResult[1] + "元素";
        }
        return false;
    };
    
    _tidyFilter["TIDY16"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY17"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY18"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY19"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY20"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY21"] = function(issue) {
        // <embed> is not approved by W3C
        var matchResult = issue.message.match(/^(.+)\sis\snot\sapproved\sby\sW3C$/);
        if(matchResult) {
            issue.message = "警告，" + matchResult[1] + "元素不是W3C认可的";
        }
        return false;
    };
    
    _tidyFilter["TIDY22"] = function(issue) {
        // <decorator:usepage> is not recognized!
        var matchResult = issue.message.match(/^(.+)\sis\snot\srecognized!$/);
        if(matchResult) {
            issue.message = "警告，" + matchResult[1] + "元素是不推荐使用的";
        }
        return false;
    };
    
    _tidyFilter["TIDY23"] = function(issue) {
        // trimming empty <span>
        var matchResult = issue.message.match(/^trimming\sempty\s(.+)$/);
        if(matchResult) {
            issue.message = "警告，" + matchResult[1] + "元素为空";
        }
        return false;
    };
    
    _tidyFilter["TIDY24"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY25"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY26"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY27"] = function(issue) {
        // content occurs after end of body
        var matchResult = issue.message.match(/^content\soccurs\safter\send\sof\sbody$/);
        if(matchResult) {
            issue.message = "警告，不能在</body>后面加在内容";
        }
        return true;
    };
    
    _tidyFilter["TIDY28"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY29"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY30"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY31"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY32"] = function(issue) {
        issue.message = "在js字符串中没有对/进行转义";
        return false;
    };
    
    _tidyFilter["TIDY33"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY34"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY35"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY36"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY37"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY38"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY39"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY40"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY41"] = function(issue) {
        // <img> element not empty or not closed
        var matchResult = issue.message.match(/^(.+)\selement\snot\sempty\sor\snot\sclosed$/);
        if(matchResult) {
            issue.message = "XHTML下，元素" + matchResult[1] + "未结束";
        }
        return false;
    };
    
    _tidyFilter["TIDY42"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY43"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY44"] = function(issue) {
        // missing <!DOCTYPE> declaration
        var matchResult = issue.message.match(/^missing\s(.+)\sdeclaration$/);
        if(matchResult) {
            issue.message = "错误，没有定义" + matchResult[1];
        }
        return true;
    };
    
    _tidyFilter["TIDY45"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY46"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY47"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY48"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY49"] = function(issue) {
        // <script> inserting "type" attribute
        var matchResult = issue.message.match(/^(.+)\sinserting\s"(.+)"\sattribute$/);
        if(matchResult) {
            if(matchResult[1] === "<script>" && matchResult[2] === "type") {
                return false;
            }
            else if(matchResult[1] === "<style>" && matchResult[2] === "type") {
                return false;
            }
            else if(matchResult[1] === "<link>" && matchResult[2] === "type") {
                return false;
            }
            else {
                issue.message = "需要在" + matchResult[1] + "元素上添加" + matchResult[2] + "属性";
                return true;
            }
        }
    };
    
    _tidyFilter["TIDY50"] = function(issue) {
        var matchResult = issue.message.match(/^(.+)\sattribute\s"(.+)"\slacks\svalue$/);
        if(matchResult) {
            if(matchResult[1] === "<table>" && matchResult[2] === "width") {
                return false;
            }
            else {
                issue.message = "元素" + matchResult[1] + "的属性" + matchResult[2] + "没有值";
                return true;
            }
            
        }
        return true;
    };
    
    _tidyFilter["TIDY51"] = function(issue) {
        // <b> attribute "id" has invalid value "6601febb16d844c18fad18152575051b_63000"
        var matchResult = issue.message.match(/^(.+)\sattribute\s"(.+)"\shas\sinvalid\svalue\s"(.+)"$/);
        if(matchResult) {
            issue.message = "元素" + matchResult[1] + "上的" + matchResult[2] + "属性值" + matchResult[3] + "是无效的";
        }
        return false;
    };
    
    _tidyFilter["TIDY52"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY53"] = function(issue) {
        // <input> proprietary attribute "placeholder"
        var matchResult = issue.message.match(/^(.+)\sproprietary\sattribute\s"(.+)"$/);
        if(matchResult) {
            issue.message = "在" + matchResult[1] + "元素上发现了未知属性" + matchResult[2];
        }
        return false;
    };
    
    _tidyFilter["TIDY54"] = function(issue) {
        // <img> proprietary attribute value "absmiddle"
        var matchResult = issue.message.match(/^(.+)\sproprietary\sattribute\svalue\s"(.+)"$/);
        if(matchResult) {
            issue.message = "警告，元素" + matchResult[1] + "使用了不跨浏览器的属性值" + matchResult[2];
        }
        return true;
    };
    
    _tidyFilter["TIDY55"] = function(issue) {
        // <a> dropping value "_blank" for repeated attribute "target"
        var matchResult = issue.message.match(/^(.+)\sdropping\svalue\s"(.+)"\sfor\srepeated\sattribute\s"(.+)"$/);
        if(matchResult) {
            issue.message = "在" + matchResult[1] + "元素上重复定义了两个" + matchResult[3] + "属性，而且值都是" + matchResult[2];
        }
        return true;
    };
    
    _tidyFilter["TIDY56"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TID57"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY58"] = function(issue) {
        // <a> unexpected or duplicate quote mark
        var matchResult = issue.message.match(/^(.+)\sunexpected\sor\sduplicate\squote\smark$/);
        if(matchResult) {
            issue.message = "在" + matchResult[1] + "元素上发现了重复的引号";
        }
        return true;
    };
    
    _tidyFilter["TIDY59"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY60"] = function(issue) {
        // <form> id and name attribute value mismatch
        var matchResult = issue.message.match(/^(.+)\sid\sand\sname\sattribute\svalue\smismatch$/);
        if(matchResult) {
            issue.message = matchResult[1] + "元素的id和name的值应该是相同的";
        }
        return false;
    };
    
    _tidyFilter["TIDY61"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY62"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY63"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY64"] = function(issue) {
        // <a> escaping malformed URI reference
        var matchResult = issue.message.match(/^(.+)\sescaping\smalformed\sURI\sreference$/);
        if(matchResult) {
            issue.message = "在" + matchResult[1] + "上发现包含特殊字符的URI";
        }
        return false;
    };
    
    _tidyFilter["TIDY65"] = function(issue) {
        // <a> discarding newline in URI reference
        var matchResult = issue.message.match(/^(.+)\sdiscarding\snewline\sin\sURI\sreference$/);
        if(matchResult) {
            issue.message = "警告，忽略" + matchResult[1] + "元素上URI中的换行符";
        }
        return false;
    };
    
    _tidyFilter["TIDY66"] = function(issue) {
        // <span> anchor "validatename" already defined
        var matchResult = issue.message.match(/^(.+)\sanchor\s"(.+)"\salready\sdefined$/);
        if(matchResult) {
            issue.message = "元素" + matchResult[1] + "的锚点" + matchResult[2] + "已经被定义";
        }
        return false;
    };
    
    _tidyFilter["TIDY67"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY68"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY69"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY70"] = function(issue) {
        // <td> attribute value "CENTER" must be lower case for XHTML
        var matchResult = issue.message.match(/^(.+)\sattribute\svalue\s"(.+)"\smust\sbe\slower\scase\sfor\sXHTML$/);
        if(matchResult) {
            issue.message = "警告，在XHTML中" + matchResult[1] + "元素的属性值必须小写";
        }
        return false;
    };
    
    _tidyFilter["TIDY71"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY72"] = function(issue) {
        // <span> attribute name "_ntesquote_" (value="code:0000100;attr:price;fixed:2;color:updown") is invalid
        var matchResult = issue.message.match(/^(.+)\sattribute\sname\s"(.+)"\s\(value="(.+)"\)\sis\sinvalid$/);
        if(matchResult) {
            issue.message = "元素" + matchResult[1] + "的属性" + matchResult[2] + "的值" + matchResult[3] + "是无效的";
        }
        return false;
    };
    
    _tidyFilter["TIDY73"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY74"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY75"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY76"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY77"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY78"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY79"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY80"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY81"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY82"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY83"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY84"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY85"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY86"] = function(issue) {
        // <table> lacks "summary" attribute
        var matchResult = issue.message.match(/^(.+)\slacks\s"(.+)"\sattribute$/);
        if(matchResult) {
            issue.message = "在" + matchResult[1] + "中缺少" + matchResult[2] + "属性";
        }
        return false;
    };
    
    _tidyFilter["TIDY87"] = function(issue) {
        return false;
    };
    
    _tidyFilter["TIDY88"] = function(issue) {
        return false;
    };
    
    
    // --------------------------------------------------------------------------------
    //
    //                                  系统事件绑定
    //
    // --------------------------------------------------------------------------------
    
    

  
  
    // firefox初始化时才会加载
    window.addEventListener('load', function(ev) {
        try {
            initTidy();
        } catch (ex) { _showError(ex); }
    }, false);
    
    // 每个Tab打开的时候都会加载
    window.addEventListener('pageshow', function(ev) {
        try {
            if(_getBoolPref("on")) {
            
                var doc = ev.originalTarget;
                if (needValidate(doc)) {
                    var html = getHtmlFromCache(doc),
                        issues = getIssuesInHTML(html, doc);
                    
                    if( issues.isEmpty() ) {
                        return false;
                    }
            
                    initPageStyles(doc, _pageStyles);
                    logIssuesToPage(issues, doc);
                }
            }
        } catch (ex) { _showError(ex); }
    }, false);
    
})();