const path = require('path');

const autoprefixer = require('autoprefixer');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebPackPlugin = require('html-webpack-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const UnminifiedWebpackPlugin = require('unminified-webpack-plugin');
const flexbugs = require('postcss-flexbugs-fixes');

module.exports = (envs, argv) => ({
  output: {
    filename: 'higlass-scalable-insets.min.js',
    library: 'higlassScalableInsets',
    libraryTarget: 'umd',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    contentBase: [
      path.join(__dirname, 'node_modules/higlass/build'),
      path.join(__dirname, 'node_modules/higlass-geojson/dist'),
      path.join(__dirname, 'node_modules/higlass-image/dist'),
      path.join(__dirname, 'examples'),
    ],
    watchContentBase: true,
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        cache: true,
        parallel: true,
      }),
      new OptimizeCssAssetsPlugin({}),
    ],
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'index',
          test: /\.css$/,
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
  module: {
    rules: [
      // Run ESLint first
      {
        enforce: 'pre',
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'eslint-loader',
        },
      },
      // Transpile the ES6 to ES5
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      // Convert SASS to CSS, postprocess it, and bundle it
      {
        test: /\.s?css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              minimize: { safe: true },
              url: false,
              modules: true,
              localIdentName: '[name]__[local]__[hash:base64:6]',
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [
                flexbugs,
                autoprefixer({
                  browsers: [
                    '>1%',
                    'last 4 versions',
                    'Firefox ESR',
                    'not ie < 9',
                  ],
                  flexbox: 'no-2009',
                }),
              ],
            },
          },
          'sass-loader',  // compiles Sass to CSS
        ],
      },
      {
        test: /.*\.(gif|png|jpe?g|svg)$/i,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: 'images/[name].[ext]',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebPackPlugin({
      template: './examples/index.html',
      filename: './index.html',
      isProduction: argv.mode === 'production',
    }),
    new HtmlWebPackPlugin({
      template: './examples/map.html',
      filename: './map.html',
      isProduction: argv.mode === 'production',
    }),
    new HtmlWebPackPlugin({
      template: './examples/hic.html',
      filename: './hic.html',
      isProduction: argv.mode === 'production',
    }),
    new UnminifiedWebpackPlugin(),
    // new BundleAnalyzerPlugin(),
  ],
  externals: {
    'pixi.js': {
      commonjs: 'pixi.js',
      commonjs2: 'pixi.js',
      amd: 'pixi.js',
      root: 'PIXI',
    },
  },
});
