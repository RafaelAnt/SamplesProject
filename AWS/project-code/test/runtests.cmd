@ECHO OFF 

REM $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/test/runtests.cmd#3 $

SETLOCAL
SET CMD_DIR=%~dp0
SET CMD_DIR=%CMD_DIR:~0,-1%

REM  This cmd file could live in two places. The first is the origional source
REM  location. The second is where it is copied to by initialize-project.
REM 
REM    {root}\Tools\lmbr_aws\aws_resource_manager\default_content\program-code\test
REM    {root}\{game}\AWS\program_code\test
REM
REM  Below we try to find {root} by looking for lmbr_aws.cmd relative to these locations

SET ROOT_DIR=%CMD_DIR%\..\..\..\..\..\..
IF EXIST %ROOT_DIR%\lmbr_aws.cmd GOTO ROOT_DIR_READY
SET ROOT_DIR=%CMD_DIR%\..\..\..\..
IF EXIST %ROOT_DIR%\lmbr_aws.cmd GOTO ROOT_DIR_READY
ECHO Can't find root directory.
GOTO :EOF
:ROOT_DIR_READY

SET SDKS_DIR=%ROOT_DIR%\Code\SDKs

SET PYTHON_DIR=%SDKS_DIR%\Python
IF EXIST %PYTHON_DIR% GOTO PYTHON_READY
ECHO Missing: %PYTHON_DIR%
GOTO :EOF
:PYTHON_READY
SET PYTHON=%PYTHON_DIR%\x64\python.exe

SET AWS_SDK_DIR=%SDKS_DIR%\AWSPythonSDK
IF EXIST %AWS_SDK_DIR%\boto3 GOTO AWS_SDK_READY
ECHO Missing: %AWS_SDK_DIR%
GOTO :EOF
:AWS_SDK_READY

SET MOCK_DIR=%ROOT_DIR%\Tools\lmbr_aws\test\mock
IF EXIST %MOCK_DIR% GOTO MOCK_READY
SET PIP=%PYTHON_DIR%\x64\Scripts\pip.exe
IF EXIST %PIP% GOTO PIP_READY
%PYTHON% -m ensurepip
%PIP% install --upgrade pip
:PIP_READY
mkdir %MOCK_DIR%
%PIP% install mock -t %MOCK_DIR%
:MOCK_READY

SET PYTHONPATH=%AWS_SDK_DIR%;%MOCK_DIR%

%PYTHON% -m unittest discover -t ../.. %*
