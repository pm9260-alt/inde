Pod::Spec.new do |s|
  s.name           = 'SkyAttitude'
  s.version        = '0.1.0'
  s.summary        = 'CMDeviceMotion attitude quaternion for the night sky overlay'
  s.description    = 'Exposes CoreMotion device attitude as a quaternion referenced to true north.'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.license        = { :type => 'MIT' }

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
